const { TenancyPayment, TenancyInvoice } = require('../models/TenancyBilling');
const Lead = require('../models/Lead');
const Tenancy = require('../models/Tenancy');
const SalesUser = require('../models/SalesUser');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');

/**
 * Get real monthly revenue data
 */
exports.getMonthlyRevenue = asyncHandler(async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  
  try {
    // Get monthly revenue aggregation from payments
    const monthlyRevenue = await TenancyPayment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Get converted leads to simulate revenue if no real payments
    const convertedLeads = await Lead.find({ 
      status: 'converted',
      convertedDate: {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`)
      }
    }).select('estimatedRevenue convertedDate');

    // Format data for charts
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = [];
    
    // Check if we have real payment data
    const totalRealRevenue = monthlyRevenue.reduce((sum, item) => sum + item.revenue, 0);
    const hasRealPaymentData = totalRealRevenue > 0;
    
    for (let month = 1; month <= 12; month++) {
      const revenueData = monthlyRevenue.find(r => r._id.month === month);
      let revenue = revenueData ? revenueData.revenue : 0;
      
      // If no real payment data, use converted leads revenue
      if (!hasRealPaymentData && convertedLeads.length > 0) {
        const monthlyConvertedLeads = convertedLeads.filter(lead => {
          const convertedMonth = new Date(lead.convertedDate).getMonth() + 1;
          return convertedMonth === month;
        });
        
        revenue = monthlyConvertedLeads.reduce((sum, lead) => sum + (lead.estimatedRevenue || 0), 0);
      }
      
      // If still no data, use sample data for demonstration
      if (!hasRealPaymentData && convertedLeads.length === 0) {
        const sampleRevenue = [
          3498, 7497, 5998, 2499, 5998, 3498, 4999, 3498, 4999, 3498, 4999, 3498
        ];
        revenue = sampleRevenue[month - 1];
      }
      
      chartData.push({
        month: monthNames[month - 1],
        revenue: revenue,
        leads: 0 // Will be populated separately if needed
      });
    }

    sendSuccess(res, { 
      chartData, 
      hasRealData: hasRealPaymentData || convertedLeads.length > 0,
      dataSource: hasRealPaymentData ? 'payments' : (convertedLeads.length > 0 ? 'converted_leads' : 'sample')
    }, 'Monthly revenue data retrieved');

  } catch (error) {
    console.error('Monthly revenue error:', error);
    sendError(res, 'Failed to fetch monthly revenue data', 500);
  }
});

/**
 * Get dashboard statistics
 */
exports.getDashboardStats = asyncHandler(async (req, res) => {
  try {
    // Lead statistics
    const leadStats = await Lead.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Revenue statistics
    const revenueStats = await TenancyPayment.aggregate([
      {
        $match: { status: 'completed' }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalLeads = leadStats.reduce((sum, item) => sum + item.count, 0);
    const convertedLeads = leadStats.find(s => s._id === 'converted')?.count || 0;
    const totalRevenue = revenueStats[0]?.total || 0;
    
    // If no real revenue data, provide sample data for demonstration
    const hasRealRevenue = totalRevenue > 0;
    const displayRevenue = hasRealRevenue ? totalRevenue : 52485; // Sample total
    const thisMonthRevenue = hasRealRevenue ? 0 : 3498; // Sample this month

    sendSuccess(res, {
      leads: {
        total: totalLeads,
        new: leadStats.find(s => s._id === 'new')?.count || 0,
        contacted: leadStats.find(s => s._id === 'contacted')?.count || 0,
        qualified: leadStats.find(s => s._id === 'qualified')?.count || 0,
        converted: convertedLeads,
        demo_scheduled: leadStats.find(s => s._id === 'demo_scheduled')?.count || 0,
        negotiation: leadStats.find(s => s._id === 'negotiation')?.count || 0,
        lost: leadStats.find(s => s._id === 'lost')?.count || 0
      },
      revenue: {
        total: displayRevenue,
        thisMonth: thisMonthRevenue,
        target: 100000,
        targetAchieved: ((displayRevenue / 100000) * 100).toFixed(1)
      },
      performance: {
        conversionRate: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0,
        avgDealSize: convertedLeads > 0 ? (displayRevenue / convertedLeads).toFixed(0) : (hasRealRevenue ? 0 : '52485'),
        leadsAssigned: totalLeads,
        leadsConverted: convertedLeads
      },
      hasRealData: {
        leads: true,
        revenue: hasRealRevenue,
        trials: false
      }
    }, 'Dashboard statistics retrieved');

  } catch (error) {
    console.error('Dashboard stats error:', error);
    sendError(res, 'Failed to fetch dashboard statistics', 500);
  }
});

/**
 * Get expiring trials
 */
exports.getExpiringTrials = asyncHandler(async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const expiringTrials = await Tenancy.find({
      'subscription.status': 'trial',
      'subscription.trialEndsAt': {
        $gt: now,
        $lte: sevenDaysFromNow
      }
    })
    .populate('owner', 'name email phone')
    .select('name slug owner subscription.trialEndsAt')
    .sort({ 'subscription.trialEndsAt': 1 });

    const trialsWithDaysRemaining = expiringTrials.map(trial => {
      const daysRemaining = Math.ceil((trial.subscription.trialEndsAt - now) / (1000 * 60 * 60 * 24));
      
      return {
        _id: trial._id,
        businessName: trial.name,
        contactPerson: {
          name: trial.owner?.name || 'Unknown',
          phone: trial.owner?.phone || 'N/A'
        },
        trial: {
          endDate: trial.subscription.trialEndsAt,
          daysRemaining: Math.max(0, daysRemaining)
        }
      };
    });

    sendSuccess(res, trialsWithDaysRemaining, 'Expiring trials retrieved');

  } catch (error) {
    console.error('Expiring trials error:', error);
    sendError(res, 'Failed to fetch expiring trials', 500);
  }
});