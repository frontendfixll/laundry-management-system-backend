const { BillingPlan, TenancyInvoice, TenancyPayment } = require('../../models/TenancyBilling');
const Tenancy = require('../../models/Tenancy');
const FeatureDefinition = require('../../models/FeatureDefinition');

const billingController = {
  // ============ BILLING PLANS ============
  
  // Get all billing plans
  getPlans: async (req, res) => {
    try {
      const { includeInactive } = req.query;
      const query = includeInactive === 'true' ? {} : { isActive: true };
      const plans = await BillingPlan.find(query).sort({ sortOrder: 1, 'price.monthly': 1 });
      
      // Get feature definitions for reference
      const featureDefinitions = await FeatureDefinition.find({ isActive: true })
        .sort({ category: 1, sortOrder: 1 });
      
      res.json({
        success: true,
        data: { 
          plans,
          featureDefinitions
        }
      });
    } catch (error) {
      console.error('Get plans error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
  },

  // Create new custom billing plan
  createPlan: async (req, res) => {
    try {
      const { 
        name, 
        displayName, 
        description, 
        price, 
        features, 
        showOnMarketing,
        isPopular,
        badge,
        trialDays,
        sortOrder
      } = req.body;
      
      // Generate slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      
      // Check if plan with this name already exists
      const existing = await BillingPlan.findOne({ name: slug });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'A plan with this name already exists'
        });
      }
      
      // Convert features object to Map if needed
      let featuresMap = features;
      if (features && !(features instanceof Map)) {
        featuresMap = new Map(Object.entries(features));
      }
      
      const plan = await BillingPlan.create({
        name: slug,
        displayName: displayName || name,
        description: description || '',
        price: price || { monthly: 0, yearly: 0 },
        features: featuresMap || new Map(),
        isCustom: true,
        isDefault: false,
        showOnMarketing: showOnMarketing !== false,
        isPopular: isPopular || false,
        badge: badge || '',
        trialDays: trialDays || 60,
        sortOrder: sortOrder || 0,
        isActive: true,
        createdBy: req.admin?._id || req.admin?.id
      });
      
      res.status(201).json({
        success: true,
        message: 'Custom plan created successfully',
        data: { plan }
      });
    } catch (error) {
      console.error('Create plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to create plan' });
    }
  },

  // Create/Update billing plan
  upsertPlan: async (req, res) => {
    try {
      const { 
        name, 
        displayName, 
        price, 
        features, 
        isActive, 
        showOnMarketing,
        isPopular,
        badge,
        trialDays,
        sortOrder
      } = req.body;
      
      // Convert features object to Map if needed
      let featuresMap = features;
      if (features && !(features instanceof Map)) {
        featuresMap = new Map(Object.entries(features));
      }
      
      const updateData = { 
        name, 
        displayName, 
        price, 
        features: featuresMap
      };
      
      // Only update optional fields if explicitly provided
      if (typeof isActive === 'boolean') updateData.isActive = isActive;
      if (typeof showOnMarketing === 'boolean') updateData.showOnMarketing = showOnMarketing;
      if (typeof isPopular === 'boolean') updateData.isPopular = isPopular;
      if (badge !== undefined) updateData.badge = badge;
      if (trialDays !== undefined) updateData.trialDays = trialDays;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      
      const plan = await BillingPlan.findOneAndUpdate(
        { name },
        updateData,
        { upsert: true, new: true }
      );
      
      res.json({
        success: true,
        message: 'Plan saved successfully',
        data: { plan }
      });
    } catch (error) {
      console.error('Upsert plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to save plan' });
    }
  },

  // Delete a custom billing plan
  deletePlan: async (req, res) => {
    try {
      const { name } = req.params;
      
      const plan = await BillingPlan.findOne({ name });
      
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }
      
      // Don't allow deleting default plans
      if (plan.isDefault || ['free', 'basic', 'pro', 'enterprise'].includes(plan.name)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default plans'
        });
      }
      
      // Check if any tenancy is using this plan
      const tenancyCount = await Tenancy.countDocuments({ 'subscription.plan': name });
      if (tenancyCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete plan. ${tenancyCount} tenancies are using this plan.`
        });
      }
      
      await BillingPlan.deleteOne({ name });
      
      res.json({
        success: true,
        message: 'Plan deleted successfully'
      });
    } catch (error) {
      console.error('Delete plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete plan' });
    }
  },

  // ============ INVOICES ============
  
  // Get all invoices (with filters)
  getInvoices: async (req, res) => {
    try {
      const { tenancyId, status, page = 1, limit = 20 } = req.query;
      
      const query = {};
      if (tenancyId) query.tenancy = tenancyId;
      if (status) query.status = status;
      
      const skip = (page - 1) * limit;
      
      const [invoices, total] = await Promise.all([
        TenancyInvoice.find(query)
          .populate('tenancy', 'name subdomain')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        TenancyInvoice.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          invoices,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get invoices error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
  },

  // Generate invoice for tenancy
  generateInvoice: async (req, res) => {
    try {
      const { tenancyId, billingCycle = 'monthly' } = req.body;
      
      const tenancy = await Tenancy.findById(tenancyId);
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      const plan = await BillingPlan.findOne({ name: tenancy.subscription.plan });
      if (!plan) {
        return res.status(400).json({ success: false, message: 'Invalid plan' });
      }
      
      const price = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly;
      const tax = price * 0.18; // 18% GST
      
      const now = new Date();
      const periodEnd = new Date(now);
      if (billingCycle === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
      
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days
      
      const invoice = await TenancyInvoice.create({
        tenancy: tenancyId,
        billingPeriod: {
          start: now,
          end: periodEnd
        },
        plan: tenancy.subscription.plan,
        billingCycle,
        amount: {
          subtotal: price,
          tax,
          discount: 0,
          total: price + tax
        },
        dueDate,
        status: 'pending'
      });
      
      await invoice.populate('tenancy', 'name subdomain');
      
      res.status(201).json({
        success: true,
        message: 'Invoice generated successfully',
        data: { invoice }
      });
    } catch (error) {
      console.error('Generate invoice error:', error);
      res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
  },

  // Mark invoice as paid
  markInvoicePaid: async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const { paymentMethod, transactionId, notes } = req.body;
      
      const invoice = await TenancyInvoice.findById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      
      invoice.status = 'paid';
      invoice.paidAt = new Date();
      invoice.paymentMethod = paymentMethod || 'manual';
      invoice.paymentDetails = { transactionId };
      invoice.notes = notes;
      await invoice.save();
      
      // Create payment record
      await TenancyPayment.create({
        tenancy: invoice.tenancy,
        invoice: invoice._id,
        amount: invoice.amount.total,
        status: 'completed',
        paymentMethod: paymentMethod || 'manual',
        transactionId,
        notes
      });
      
      // Update tenancy subscription
      const tenancy = await Tenancy.findById(invoice.tenancy);
      if (tenancy) {
        tenancy.subscription.status = 'active';
        tenancy.subscription.startDate = invoice.billingPeriod.start;
        tenancy.subscription.endDate = invoice.billingPeriod.end;
        await tenancy.save();
      }
      
      res.json({
        success: true,
        message: 'Invoice marked as paid',
        data: { invoice }
      });
    } catch (error) {
      console.error('Mark invoice paid error:', error);
      res.status(500).json({ success: false, message: 'Failed to update invoice' });
    }
  },

  // ============ PAYMENTS ============
  
  // Get all payments
  getPayments: async (req, res) => {
    try {
      const { tenancyId, status, page = 1, limit = 20 } = req.query;
      
      const query = {};
      if (tenancyId) query.tenancy = tenancyId;
      if (status) query.status = status;
      
      const skip = (page - 1) * limit;
      
      const [payments, total] = await Promise.all([
        TenancyPayment.find(query)
          .populate('tenancy', 'name subdomain')
          .populate('invoice', 'invoiceNumber')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        TenancyPayment.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get payments error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch payments' });
    }
  },

  // ============ BILLING STATS ============
  
  // Get billing overview stats
  getBillingStats: async (req, res) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      
      const [
        totalRevenue,
        monthlyRevenue,
        yearlyRevenue,
        pendingInvoices,
        overdueInvoices,
        planDistribution
      ] = await Promise.all([
        TenancyPayment.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TenancyPayment.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TenancyPayment.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: startOfYear } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TenancyInvoice.countDocuments({ status: 'pending' }),
        TenancyInvoice.countDocuments({ status: 'overdue' }),
        Tenancy.aggregate([
          { $group: { _id: '$subscription.plan', count: { $sum: 1 } } }
        ])
      ]);
      
      res.json({
        success: true,
        data: {
          stats: {
            totalRevenue: totalRevenue[0]?.total || 0,
            monthlyRevenue: monthlyRevenue[0]?.total || 0,
            yearlyRevenue: yearlyRevenue[0]?.total || 0,
            pendingInvoices,
            overdueInvoices,
            planDistribution: planDistribution.reduce((acc, item) => {
              acc[item._id || 'free'] = item.count;
              return acc;
            }, {})
          }
        }
      });
    } catch (error) {
      console.error('Get billing stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch billing stats' });
    }
  },

  // Update tenancy subscription plan
  updateTenancyPlan: async (req, res) => {
    try {
      const { tenancyId } = req.params;
      const { plan, billingCycle } = req.body;
      
      const tenancy = await Tenancy.findById(tenancyId);
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      const billingPlan = await BillingPlan.findOne({ name: plan });
      if (!billingPlan) {
        return res.status(400).json({ success: false, message: 'Invalid plan' });
      }
      
      // Convert features Map to plain object for tenancy
      let features = {};
      if (billingPlan.features instanceof Map) {
        features = Object.fromEntries(billingPlan.features);
      } else if (billingPlan.features) {
        features = billingPlan.features;
      }
      
      tenancy.subscription.plan = plan;
      tenancy.subscription.features = features;
      
      // Update subscription dates if upgrading
      if (billingCycle) {
        const now = new Date();
        tenancy.subscription.startDate = now;
        tenancy.subscription.endDate = billingCycle === 'yearly'
          ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        tenancy.subscription.status = 'active';
      }
      
      await tenancy.save();
      
      res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update tenancy plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
  }
};

module.exports = billingController;
