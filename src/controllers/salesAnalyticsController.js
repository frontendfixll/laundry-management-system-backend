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
    console.log('🔍 Fetching monthly revenue for year:', year);

    let monthlyRevenue = [];
    let convertedLeads = [];

    // Get monthly revenue aggregation from payments with error handling
    try {
      monthlyRevenue = await TenancyPayment.aggregate([
        {
          $match: {
            status: 'completed',
            amount: { $gt: 0 }, // Only include payments with actual amounts
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
      console.log('✅ Monthly revenue fetched:', monthlyRevenue);
    } catch (error) {
      console.error('❌ Monthly revenue error:', error);
      monthlyRevenue = []; // Will use fallback data
    }

    // Get converted leads with error handling (use createdAt since convertedDate might be null)
    try {
      convertedLeads = await Lead.find({
        status: 'converted',
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`)
        }
      }).select('estimatedRevenue createdAt convertedDate');
      console.log('✅ Converted leads fetched:', convertedLeads.length);
    } catch (error) {
      console.error('❌ Converted leads error:', error);
      convertedLeads = []; // Will use sample data
    }

    // Format data for charts
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = [];

    // Check if we have real payment data
    const totalRealRevenue = monthlyRevenue.reduce((sum, item) => sum + item.revenue, 0);
    const hasRealPaymentData = totalRealRevenue > 0;

    for (let month = 1; month <= 12; month++) {
      const revenueData = monthlyRevenue.find(r => r._id.month === month);
      let revenue = revenueData ? revenueData.revenue : 0;

      // If no real payment data for this month, use converted leads revenue
      if (revenue === 0 && convertedLeads.length > 0) {
        const monthlyConvertedLeads = convertedLeads.filter(lead => {
          const leadMonth = new Date(lead.createdAt).getMonth() + 1;
          return leadMonth === month;
        });

        revenue = monthlyConvertedLeads.reduce((sum, lead) => sum + (lead.estimatedRevenue || 0), 0);
      }

      chartData.push({
        month: monthNames[month - 1],
        revenue: revenue,
        leads: 0 // Will be populated separately if needed
      });
    }

    const responseData = {
      chartData,
      hasRealData: hasRealPaymentData || convertedLeads.length > 0,
      dataSource: hasRealPaymentData ? 'payments' : (convertedLeads.length > 0 ? 'converted_leads' : 'none'),
      totalRealRevenue,
      totalConvertedLeads: convertedLeads.length
    };

    console.log('✅ Monthly revenue response:', responseData);
    sendSuccess(res, responseData, 'Monthly revenue data retrieved');

  } catch (error) {
    console.error('❌ Monthly revenue error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to retrieve monthly revenue data', 500);
  }
});

/**
 * Get dashboard statistics
 */
exports.getDashboardStats = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching dashboard stats...');

    // Lead statistics - include direct purchases
    let leadStats = [];
    try {
      leadStats = await Lead.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      // Also get direct purchase stats (leads with direct_purchase tag)
      const directPurchases = await Lead.countDocuments({ 
        tags: { $in: ['direct_purchase'] },
        status: 'converted'
      });
      
      console.log('✅ Lead stats fetched:', leadStats);
      console.log('✅ Direct purchases:', directPurchases);
    } catch (error) {
      console.error('❌ Lead stats error:', error);
      leadStats = [];
    }

    // Revenue statistics - only count payments with actual amounts
    let revenueStats = [];
    try {
      revenueStats = await TenancyPayment.aggregate([
        {
          $match: {
            status: 'completed',
            amount: { $gt: 0 } // Only include payments with actual amounts
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);
      console.log('✅ Revenue stats fetched:', revenueStats);
    } catch (error) {
      console.error('❌ Revenue stats error:', error);
      revenueStats = [];
    }

    // Current month revenue
    let currentMonthRevenue = 0;
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const monthlyRevenueStats = await TenancyPayment.aggregate([
        {
          $match: {
            status: 'completed',
            amount: { $gt: 0 },
            createdAt: {
              $gte: startOfMonth,
              $lte: endOfMonth
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      currentMonthRevenue = monthlyRevenueStats[0]?.total || 0;
      console.log('✅ Current month revenue:', currentMonthRevenue);
    } catch (error) {
      console.error('❌ Current month revenue error:', error);
    }

    // Trial statistics from Real Tenancy model
    let trialStats = { active: 0, expiringSoon: 0, expired: 0 };
    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const trials = await Tenancy.aggregate([
        { $match: { 'subscription.status': 'trial' } },
        {
          $group: {
            _id: null,
            active: { $sum: { $cond: [{ $gt: ['$subscription.trialEndsAt', now] }, 1, 0] } },
            expiringSoon: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$subscription.trialEndsAt', now] },
                      { $lte: ['$subscription.trialEndsAt', sevenDaysFromNow] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            expired: { $sum: { $cond: [{ $lte: ['$subscription.trialEndsAt', now] }, 1, 0] } }
          }
        }
      ]);

      if (trials.length > 0) {
        trialStats = {
          active: trials[0].active,
          expiringSoon: trials[0].expiringSoon,
          expired: trials[0].expired
        };
      }
      console.log('✅ Trial stats fetched:', trialStats);
    } catch (error) {
      console.error('❌ Trial stats error:', error);
    }

    const totalLeads = leadStats.reduce((sum, item) => sum + item.count, 0);
    const convertedLeads = leadStats.find(s => s._id === 'converted')?.count || 0;
    const totalRevenue = revenueStats[0]?.total || 0;

    // Revenue target: configurable via env (SALES_MONTHLY_REVENUE_TARGET) or default ₹100,000
    const monthlyTarget = parseInt(process.env.SALES_MONTHLY_REVENUE_TARGET, 10) || 100000;
    const targetAchieved = monthlyTarget > 0 && currentMonthRevenue > 0
      ? parseFloat(((currentMonthRevenue / monthlyTarget) * 100).toFixed(1))
      : 0;

    const responseData = {
      leads: {
        total: totalLeads,
        new: leadStats.find(s => s._id === 'new')?.count || 0,
        contacted: leadStats.find(s => s._id === 'contacted')?.count || 0,
        qualified: leadStats.find(s => s._id === 'qualified')?.count || 0,
        converted: convertedLeads,
        demo_scheduled: leadStats.find(s => s._id === 'demo_scheduled')?.count || 0,
        negotiation: leadStats.find(s => s._id === 'negotiation')?.count || 0,
        lost: leadStats.find(s => s._id === 'lost')?.count || 0,
        directPurchases: await Lead.countDocuments({ tags: { $in: ['direct_purchase'] }, status: 'converted' })
      },
      revenue: {
        total: totalRevenue,
        thisMonth: currentMonthRevenue,
        target: monthlyTarget,
        targetAchieved: targetAchieved,
        directPurchaseRevenue: await TenancyPayment.aggregate([
          { $match: { status: 'completed', amount: { $gt: 0 } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).then(result => result[0]?.total || 0)
      },
      performance: {
        conversionRate: totalLeads > 0 ? parseFloat(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0,
        avgDealSize: convertedLeads > 0 ? parseFloat((totalRevenue / convertedLeads).toFixed(0)) : 0,
        leadsAssigned: totalLeads,
        leadsConverted: convertedLeads,
        totalRevenue: totalRevenue,
        currentMonthRevenue: currentMonthRevenue,
        targetAchieved: targetAchieved,
        directConversionRate: totalLeads > 0 ? parseFloat(((await Lead.countDocuments({ tags: { $in: ['direct_purchase'] }, status: 'converted' }) / totalLeads) * 100).toFixed(1)) : 0
      },
      trials: trialStats,
      hasRealData: {
        leads: totalLeads > 0,
        revenue: totalRevenue > 0,
        trials: trialStats.active > 0 || trialStats.expired > 0,
        directPurchases: await Lead.countDocuments({ tags: { $in: ['direct_purchase'] } }) > 0
      }
    };

    console.log('✅ Dashboard stats response:', responseData);
    sendSuccess(res, responseData, 'Dashboard statistics retrieved');

  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to retrieve dashboard statistics', 500);
  }
});

/**
 * Get expiring trials
 */
exports.getExpiringTrials = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching expiring trials...');

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let expiringTrials = [];

    try {
      expiringTrials = await Tenancy.find({
        'subscription.status': 'trial',
        'subscription.trialEndsAt': {
          $gt: now,
          $lte: sevenDaysFromNow
        }
      })
        .populate('owner', 'name email phone')
        .select('name slug owner subscription.trialEndsAt')
        .sort({ 'subscription.trialEndsAt': 1 });

      console.log('✅ Expiring trials fetched:', expiringTrials.length);
    } catch (error) {
      console.error('❌ Expiring trials query error:', error);
      expiringTrials = []; // Will use sample data
    }

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

    console.log('✅ Expiring trials response:', trialsWithDaysRemaining.length);
    sendSuccess(res, trialsWithDaysRemaining, 'Expiring trials retrieved');

  } catch (error) {
    console.error('❌ Expiring trials error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to retrieve expiring trials', 500);
  }
});
