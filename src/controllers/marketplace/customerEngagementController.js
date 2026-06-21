// Read-derived engagement surfaces for the customer app: a notifications feed
// built from order status history, and a loyalty summary aggregated from
// delivered orders. No extra write-path hooks — both are computed at read time.

const Order = require('../../models/Order');

const STATUS_TEXT = {
  placed: 'Your order was placed.',
  assigned_to_branch: 'Your order was assigned to the branch.',
  assigned_to_logistics_pickup: 'Pickup has been scheduled.',
  picked: 'Your laundry was picked up.',
  in_process: 'Your laundry is being processed.',
  ready: 'Your order is ready.',
  assigned_to_logistics_delivery: 'Your order is out for delivery.',
  out_for_delivery: 'Your order is out for delivery.',
  delivered: 'Your order was delivered. Enjoy!',
  cancelled: 'Your order was cancelled.',
};

// GET /api/customer-app/notifications
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const orders = await Order.find({ customer: userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('orderNumber status statusHistory createdAt updatedAt')
      .lean();

    const items = [];
    for (const o of orders) {
      const history = Array.isArray(o.statusHistory) && o.statusHistory.length
        ? o.statusHistory
        : [{ status: o.status, updatedAt: o.createdAt }];
      for (const h of history) {
        items.push({
          id: `${o._id}-${h.status}-${new Date(h.updatedAt || o.createdAt).getTime()}`,
          type: 'order_status',
          orderId: o._id,
          orderNumber: o.orderNumber,
          status: h.status,
          title: `Order ${o.orderNumber}`,
          body: STATUS_TEXT[h.status] || `Status: ${h.status}`,
          createdAt: h.updatedAt || o.createdAt,
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ success: true, notifications: items.slice(0, 40) });
  } catch (err) {
    console.error('[marketplace] getNotifications error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load notifications' });
  }
};

const TIERS = [
  { key: 'bronze', name: 'Bronze', min: 0 },
  { key: 'silver', name: 'Silver', min: 500 },
  { key: 'gold', name: 'Gold', min: 1500 },
  { key: 'platinum', name: 'Platinum', min: 3000 },
];

// GET /api/customer-app/loyalty
// Points = 1 per ₹10 spent on delivered orders. Tier from lifetime points.
exports.getLoyalty = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const delivered = await Order.find({ customer: userId, status: 'delivered' })
      .select('pricing.total')
      .lean();

    const totalSpent = delivered.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);
    const points = Math.floor(totalSpent / 10);
    const lifetimeOrders = delivered.length;

    let tierIdx = 0;
    for (let i = TIERS.length - 1; i >= 0; i--) {
      if (points >= TIERS[i].min) {
        tierIdx = i;
        break;
      }
    }
    const tier = TIERS[tierIdx];
    const nextTier = TIERS[tierIdx + 1] || null;
    const progress = nextTier ? Math.min(1, (points - tier.min) / (nextTier.min - tier.min)) : 1;

    return res.json({
      success: true,
      loyalty: {
        points,
        totalSpent,
        lifetimeOrders,
        tier: tier.name,
        tierKey: tier.key,
        nextTier: nextTier ? nextTier.name : null,
        pointsToNextTier: nextTier ? Math.max(0, nextTier.min - points) : 0,
        progress: Math.round(progress * 100) / 100,
      },
    });
  } catch (err) {
    console.error('[marketplace] getLoyalty error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load loyalty' });
  }
};
