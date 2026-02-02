const AddOn = require('../models/AddOn');
const TenantAddOn = require('../models/TenantAddOn');
const AddOnTransaction = require('../models/AddOnTransaction');
const Tenancy = require('../models/Tenancy');
const addOnStripeService = require('../services/addOnStripeService');
const socketService = require('../services/socketService');
const { validationResult } = require('express-validator');

/**
 * Get marketplace add-ons for tenant
 */
const getMarketplaceAddOns = async (req, res) => {
  try {
    const tenantId = req.user?.tenancy;
    const { 
      category, 
      search, 
      sortBy = 'popular', 
      limit = 20, 
      page = 1,
      priceRange,
      features
    } = req.query;

    // Build filter query
    const filters = {
      status: 'active',
      showOnMarketplace: true,
      isDeleted: false
    };

    if (category) filters.category = category;
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Price range filter
    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      
      // Get the primary/display price for filtering
      // Priority: monthly > oneTime > yearly (most common pricing display)
      filters.$or = [
        // Has monthly pricing in range
        { 
          'pricing.monthly': { $exists: true, $gte: min, $lte: max, $gt: 0 }
        },
        // No monthly pricing, has oneTime pricing in range
        { 
          $and: [
            { $or: [{ 'pricing.monthly': { $exists: false } }, { 'pricing.monthly': { $lte: 0 } }] },
            { 'pricing.oneTime': { $exists: true, $gte: min, $lte: max, $gt: 0 } }
          ]
        },
        // No monthly or oneTime pricing, has yearly pricing in range
        { 
          $and: [
            { $or: [{ 'pricing.monthly': { $exists: false } }, { 'pricing.monthly': { $lte: 0 } }] },
            { $or: [{ 'pricing.oneTime': { $exists: false } }, { 'pricing.oneTime': { $lte: 0 } }] },
            { 'pricing.yearly': { $exists: true, $gte: min, $lte: max, $gt: 0 } }
          ]
        }
      ];
    }

    // Features filter
    if (features) {
      const featureList = features.split(',');
      filters['config.features.key'] = { $in: featureList };
    }

    // Build sort query
    let sortQuery = {};
    switch (sortBy) {
      case 'popular':
        sortQuery = { isPopular: -1, 'analytics.purchases': -1, sortOrder: 1 };
        break;
      case 'price_low':
        sortQuery = { 'pricing.monthly': 1, 'pricing.yearly': 1 };
        break;
      case 'price_high':
        sortQuery = { 'pricing.monthly': -1, 'pricing.yearly': -1 };
        break;
      case 'newest':
        sortQuery = { createdAt: -1 };
        break;
      case 'name':
        sortQuery = { displayName: 1 };
        break;
      default:
        sortQuery = { isFeatured: -1, isPopular: -1, sortOrder: 1 };
    }

    // Get add-ons with pagination
    const skip = (page - 1) * limit;
    const [addOns, totalCount] = await Promise.all([
      AddOn.find(filters)
        .sort(sortQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AddOn.countDocuments(filters)
    ]);

    // Get tenant's existing add-ons
    let tenantAddOns = [];
    if (tenantId) {
      tenantAddOns = await TenantAddOn.find({
        tenant: tenantId,
        status: { $in: ['active', 'trial'] },
        isDeleted: false
      }).select('addOn').lean();
    }

    const tenantAddOnIds = tenantAddOns.map(ta => ta.addOn.toString());

    // Check eligibility for each add-on
    let tenant = null;
    if (tenantId) {
      tenant = await Tenancy.findById(tenantId);
    }

    const enrichedAddOns = await Promise.all(
      addOns.map(async (addOn) => {
        // Increment view count
        await AddOn.findByIdAndUpdate(addOn._id, { $inc: { 'analytics.views': 1 } });

        const enriched = {
          ...addOn,
          isPurchased: tenantAddOnIds.includes(addOn._id.toString()),
          eligibility: tenant ? addOn.isEligibleForTenant ? addOn.isEligibleForTenant(tenant) : { eligible: true } : { eligible: true },
          formattedPricing: {
            monthly: addOn.pricing.monthly ? `₹${addOn.pricing.monthly}` : null,
            yearly: addOn.pricing.yearly ? `₹${addOn.pricing.yearly}` : null,
            oneTime: addOn.pricing.oneTime ? `₹${addOn.pricing.oneTime}` : null,
            savings: addOn.pricing.yearly && addOn.pricing.monthly ? 
              Math.round(((addOn.pricing.monthly * 12 - addOn.pricing.yearly) / (addOn.pricing.monthly * 12)) * 100) : 0
          }
        };

        // Get regional pricing if available
        if (req.user?.country) {
          const regionalPricing = addOn.getPricingForRegion ? addOn.getPricingForRegion(req.user.country) : null;
          if (regionalPricing) {
            enriched.regionalPricing = regionalPricing;
          }
        }

        return enriched;
      })
    );

    // Get categories for filtering
    const categories = await AddOn.distinct('category', filters);

    return res.json({
      success: true,
      data: {
        addOns: enrichedAddOns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        filters: {
          categories,
          sortOptions: [
            { value: 'popular', label: 'Most Popular' },
            { value: 'price_low', label: 'Price: Low to High' },
            { value: 'price_high', label: 'Price: High to Low' },
            { value: 'newest', label: 'Newest First' },
            { value: 'name', label: 'Name A-Z' }
          ]
        }
      }
    });
  } catch (error) {
    console.error('Get marketplace add-ons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch marketplace add-ons'
    });
  }
};

/**
 * Get add-on details
 */
const getAddOnDetails = async (req, res) => {
  try {
    const { addOnId } = req.params;
    const tenantId = req.user?.tenancy;

    const addOn = await AddOn.findById(addOnId);
    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Increment view count
    await addOn.incrementView();

    // Check if tenant already has this add-on
    let tenantAddOn = null;
    let eligibility = { eligible: true };
    
    if (tenantId) {
      const [existingAddOn, tenant] = await Promise.all([
        TenantAddOn.findByTenantAndAddOn(tenantId, addOnId),
        Tenancy.findById(tenantId)
      ]);
      
      tenantAddOn = existingAddOn;
      eligibility = addOn.isEligibleForTenant(tenant);
    }

    // Get similar add-ons
    const similarAddOns = await AddOn.find({
      _id: { $ne: addOnId },
      category: addOn.category,
      status: 'active',
      showOnMarketplace: true,
      isDeleted: false
    }).limit(4).select('name displayName description pricing category');

    return res.json({
      success: true,
      data: {
        addOn: {
          ...addOn.toObject(),
          isPurchased: !!tenantAddOn,
          tenantAddOn: tenantAddOn ? {
            status: tenantAddOn.status,
            activatedAt: tenantAddOn.activatedAt,
            nextBillingDate: tenantAddOn.nextBillingDate,
            usageTracking: tenantAddOn.usageTracking
          } : null,
          eligibility,
          formattedPricing: addOn.formattedPricing
        },
        similarAddOns
      }
    });
  } catch (error) {
    console.error('Get add-on details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on details'
    });
  }
};

/**
 * Purchase add-on
 */
const purchaseAddOn = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { addOnId } = req.params;
    const { 
      billingCycle = 'monthly', 
      quantity = 1,
      paymentMethodId,
      couponCode,
      metadata = {}
    } = req.body;
    
    const tenantId = req.user.tenancy;
    const userId = req.user._id;

    // Get add-on and tenant (already validated by middleware)
    const { addOn, tenant } = req.addOnPurchase;

    // Check quantity limits
    if (quantity > addOn.maxQuantity) {
      return res.status(400).json({
        success: false,
        message: `Maximum quantity allowed is ${addOn.maxQuantity}`
      });
    }

    // Get pricing for billing cycle
    let price = 0;
    switch (billingCycle) {
      case 'monthly':
        price = addOn.pricing.monthly;
        break;
      case 'yearly':
        price = addOn.pricing.yearly;
        break;
      case 'one-time':
        price = addOn.pricing.oneTime;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid billing cycle'
        });
    }

    if (!price || price <= 0) {
      return res.status(400).json({
        success: false,
        message: `${billingCycle} billing is not available for this add-on`
      });
    }

    // Calculate total amount
    const subtotal = price * quantity;
    let discount = 0;
    let tax = Math.round(subtotal * 0.18); // 18% GST
    
    // Apply coupon if provided
    if (couponCode) {
      // TODO: Implement coupon validation and discount calculation
    }

    const total = subtotal + tax - discount;

    // Generate transaction ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `TXN-${timestamp}-${random}`;

    // Create transaction record
    const transaction = new AddOnTransaction({
      tenant: tenantId,
      transactionId, // Add the generated transactionId
      type: 'purchase',
      status: 'pending',
      amount: {
        subtotal,
        tax,
        discount,
        total,
        currency: 'INR'
      },
      billingPeriod: billingCycle !== 'one-time' ? {
        start: new Date(),
        end: billingCycle === 'monthly' ? 
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) :
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      } : undefined,
      source: 'marketplace',
      initiatedBy: userId,
      initiatedByModel: 'User',
      metadata: {
        addOnId,
        billingCycle,
        quantity,
        ...metadata
      }
    });

    // Add line items
    transaction.addLineItem({
      type: 'addon',
      description: `${addOn.displayName} - ${billingCycle}`,
      unitPrice: price,
      quantity,
      amount: subtotal,
      addOn: addOn._id,
      billingPeriod: transaction.billingPeriod
    });

    if (tax > 0) {
      transaction.addLineItem({
        type: 'tax',
        description: 'GST (18%)',
        unitPrice: tax,
        quantity: 1,
        amount: tax,
        taxDetails: {
          rate: 18,
          amount: tax,
          type: 'GST'
        }
      });
    }

    await transaction.save();

    // Process payment with Stripe
    let paymentResult;
    try {
      paymentResult = await addOnStripeService.processAddOnPayment({
        amount: total,
        currency: 'inr',
        paymentMethodId,
        customerId: tenant.stripeCustomerId,
        metadata: {
          transactionId: transaction.transactionId,
          tenantId: tenantId.toString(),
          addOnId: addOnId.toString(),
          billingCycle,
          quantity: quantity.toString()
        }
      });

      // Update transaction with payment details
      transaction.paymentDetails = {
        method: 'card',
        gateway: 'stripe',
        gatewayTransactionId: paymentResult.paymentIntentId,
        gatewayResponse: paymentResult
      };

      if (paymentResult.status === 'succeeded') {
        transaction.markCompleted({
          gatewayTransactionId: paymentResult.paymentIntentId,
          gatewayResponse: paymentResult
        });

        // Create or update tenant add-on
        let tenantAddOn = await TenantAddOn.findByTenantAndAddOn(tenantId, addOnId);
        
        if (tenantAddOn) {
          // Update existing add-on (increase quantity or extend period)
          tenantAddOn.quantity += quantity;
          tenantAddOn.status = 'active';
        } else {
          // Create new tenant add-on
          tenantAddOn = new TenantAddOn({
            tenant: tenantId,
            addOn: addOnId,
            status: 'active',
            billingCycle,
            quantity,
            pricingSnapshot: {
              monthly: addOn.pricing.monthly,
              yearly: addOn.pricing.yearly,
              oneTime: addOn.pricing.oneTime,
              currency: 'INR'
            },
            assignedBy: userId,
            assignedByModel: 'TenantAdmin', // Fixed: Use valid enum value
            assignmentMethod: 'purchase',
            // Set next billing date based on billing cycle
            nextBillingDate: billingCycle !== 'one-time' ? (
              billingCycle === 'monthly' ? 
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) :
                new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            ) : undefined,
            analytics: {
              activationSource: 'marketplace'
            }
          });

          // Initialize usage tracking for usage-based add-ons
          if (billingCycle === 'usage-based' && addOn.config?.usage) {
            tenantAddOn.usageTracking = {
              remainingCredits: addOn.config.usage.amount * quantity,
              autoRenew: addOn.config.usage.autoRenew || false,
              renewalThreshold: addOn.config.usage.lowBalanceThreshold || 10
            };
          }
        }

        // Add billing record
        tenantAddOn.addBillingRecord({
          transactionId: transaction.transactionId,
          amount: total,
          billingPeriod: transaction.billingPeriod,
          paymentMethod: 'card',
          paymentStatus: 'completed',
          stripePaymentIntentId: paymentResult.paymentIntentId
        });

        await tenantAddOn.save();
        transaction.tenantAddOn = tenantAddOn._id;
        await transaction.save();

        // Update add-on analytics
        await addOn.recordPurchase(total);

        // Emit real-time update
        socketService.sendToTenancy(tenantId, {
          type: 'addOnPurchased',
          data: {
            addOn: {
              id: addOn._id,
              name: addOn.name,
              displayName: addOn.displayName,
              category: addOn.category
            },
            tenantAddOn: {
              id: tenantAddOn._id,
              status: tenantAddOn.status,
              quantity: tenantAddOn.quantity,
              activatedAt: tenantAddOn.activatedAt
            },
            transaction: {
              id: transaction._id,
              transactionId: transaction.transactionId,
              amount: transaction.amount
            }
          }
        });

        // Trigger feature update event for real-time UI updates
        socketService.sendToRoom(`tenant:${tenantId}`, 'featuresUpdated', {
          source: 'addon_purchase',
          addOn: addOn.name,
          features: addOn.config?.features || []
        });

        return res.json({
          success: true,
          message: 'Add-on purchased successfully',
          data: {
            transaction: {
              id: transaction._id,
              transactionId: transaction.transactionId,
              status: transaction.status,
              amount: transaction.amount
            },
            tenantAddOn: {
              id: tenantAddOn._id,
              status: tenantAddOn.status,
              activatedAt: tenantAddOn.activatedAt,
              nextBillingDate: tenantAddOn.nextBillingDate
            },
            addOn: {
              id: addOn._id,
              name: addOn.name,
              displayName: addOn.displayName,
              category: addOn.category
            }
          }
        });
      } else {
        // Payment failed
        transaction.markFailed(paymentResult.error || 'Payment failed');
        await transaction.save();

        return res.status(400).json({
          success: false,
          message: 'Payment failed',
          error: paymentResult.error,
          transaction: {
            id: transaction._id,
            transactionId: transaction.transactionId,
            status: transaction.status
          }
        });
      }
    } catch (paymentError) {
      console.error('Payment processing error:', paymentError);
      
      transaction.markFailed(paymentError.message);
      await transaction.save();

      return res.status(500).json({
        success: false,
        message: 'Payment processing failed',
        error: paymentError.message,
        transaction: {
          id: transaction._id,
          transactionId: transaction.transactionId,
          status: transaction.status
        }
      });
    }
  } catch (error) {
    console.error('Purchase add-on error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to purchase add-on'
    });
  }
};

/**
 * Get tenant's add-ons
 */
const getTenantAddOns = async (req, res) => {
  try {
    console.log('🔍 getTenantAddOns - User:', req.user?.email, 'Role:', req.user?.role);
    console.log('🔍 getTenantAddOns - tenancyId:', req.user?.tenancy, 'isBranchAdmin:', req.user?.role === 'branch_admin');
    
    const tenantId = req.user.tenancy;
    const { status, category, includeUsage = true } = req.query;

    if (!tenantId) {
      console.log('❌ No tenancy ID found for user:', req.user?.email);
      return res.status(400).json({
        success: false,
        message: 'User has no tenancy assigned'
      });
    }

    const query = { tenant: tenantId, isDeleted: false };
    if (status) query.status = status;
    
    console.log('🔍 Query for TenantAddOn:', query);

    const tenantAddOns = await TenantAddOn.find(query)
      .populate({
        path: 'addOn',
        match: category ? { category } : {},
        select: 'name displayName description category config pricing'
      })
      .sort({ createdAt: -1 });

    console.log('🔍 Found TenantAddOns:', tenantAddOns.length);

    // Filter out add-ons where populate didn't match
    const filteredAddOns = tenantAddOns.filter(ta => ta.addOn);
    
    console.log('🔍 Filtered AddOns (with valid addOn ref):', filteredAddOns.length);

    // Enrich with usage data if requested
    const enrichedAddOns = await Promise.all(
      filteredAddOns.map(async (tenantAddOn) => {
        const data = {
          id: tenantAddOn._id,
          addOn: tenantAddOn.addOn,
          status: tenantAddOn.status,
          quantity: tenantAddOn.quantity,
          activatedAt: tenantAddOn.activatedAt,
          nextBillingDate: tenantAddOn.nextBillingDate,
          billingCycle: tenantAddOn.billingCycle,
          isActive: tenantAddOn.isActive(),
          daysRemaining: tenantAddOn.daysRemaining,
          effectivePricing: tenantAddOn.effectivePricing
        };

        if (includeUsage === 'true' && tenantAddOn.billingCycle === 'usage-based') {
          data.usageTracking = tenantAddOn.usageTracking;
        }

        return data;
      })
    );

    // Get summary statistics
    const summary = {
      total: enrichedAddOns.length,
      active: enrichedAddOns.filter(ta => ta.status === 'active').length,
      trial: enrichedAddOns.filter(ta => ta.status === 'trial').length,
      suspended: enrichedAddOns.filter(ta => ta.status === 'suspended').length,
      byCategory: {}
    };

    enrichedAddOns.forEach(ta => {
      const category = ta.addOn.category;
      summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
    });

    console.log('✅ Returning enriched add-ons:', enrichedAddOns.length);
    console.log('📊 Summary:', summary);

    return res.json({
      success: true,
      data: {
        addOns: enrichedAddOns,
        summary
      }
    });
  } catch (error) {
    console.error('❌ Get tenant add-ons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant add-ons',
      error: error.message
    });
  }
};

/**
 * Cancel add-on
 */
const cancelAddOn = async (req, res) => {
  try {
    const { tenantAddOnId } = req.params;
    const { reason, effectiveDate } = req.body;
    const tenantId = req.user.tenancy;
    const userId = req.user._id;

    const tenantAddOn = await TenantAddOn.findOne({
      _id: tenantAddOnId,
      tenant: tenantId,
      isDeleted: false
    }).populate('addOn');

    if (!tenantAddOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    if (tenantAddOn.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Add-on is already cancelled'
      });
    }

    // Cancel the add-on
    await tenantAddOn.cancel(
      reason || 'Cancelled by user',
      userId,
      'TenantAdmin', // Changed from 'User' to 'TenantAdmin'
      effectiveDate ? new Date(effectiveDate) : null
    );

    // Emit real-time update
    socketService.emitToTenant(tenantId, 'addOnCancelled', {
      addOn: {
        id: tenantAddOn.addOn._id,
        name: tenantAddOn.addOn.name,
        displayName: tenantAddOn.addOn.displayName
      },
      tenantAddOn: {
        id: tenantAddOn._id,
        status: tenantAddOn.status,
        cancelledAt: tenantAddOn.cancelledAt
      }
    });

    // Trigger feature update event
    socketService.emitToTenant(tenantId, 'featuresUpdated', {
      source: 'addon_cancelled',
      addOn: tenantAddOn.addOn.name,
      features: tenantAddOn.addOn.config?.features || []
    });

    return res.json({
      success: true,
      message: 'Add-on cancelled successfully',
      data: {
        tenantAddOn: {
          id: tenantAddOn._id,
          status: tenantAddOn.status,
          cancelledAt: tenantAddOn.cancelledAt,
          cancellationInfo: tenantAddOn.cancellationInfo
        }
      }
    });
  } catch (error) {
    console.error('Cancel add-on error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel add-on'
    });
  }
};

/**
 * Get add-on usage statistics
 */
const getAddOnUsageStats = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const { period = '30d', addOnId } = req.query;

    // Calculate date range
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get usage statistics
    const usageStats = await TenantAddOn.getUsageStats(tenantId, addOnId);

    // Get transaction history
    const transactions = await AddOnTransaction.findByTenant(tenantId, {
      dateFrom: startDate,
      dateTo: endDate,
      limit: 10
    });

    return res.json({
      success: true,
      data: {
        period,
        dateRange: { startDate, endDate },
        usageStats,
        recentTransactions: transactions
      }
    });
  } catch (error) {
    console.error('Get add-on usage stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch usage statistics'
    });
  }
};

module.exports = {
  getMarketplaceAddOns,
  getAddOnDetails,
  purchaseAddOn,
  getTenantAddOns,
  cancelAddOn,
  getAddOnUsageStats
};