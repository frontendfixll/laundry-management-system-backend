const TenantAddOn = require('../models/TenantAddOn');
const AddOn = require('../models/AddOn');
const Tenancy = require('../models/Tenancy');

/**
 * Middleware to check if tenant has access to a specific add-on feature
 * Usage: checkAddOnFeature('campaigns')
 */
const checkAddOnFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenancy;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      // Get tenant's active add-ons
      const activeAddOns = await TenantAddOn.findActiveByTenant(tenantId);
      
      // Check if any active add-on provides this feature
      let hasFeature = false;
      let addOnSource = null;

      for (const tenantAddOn of activeAddOns) {
        const addOn = tenantAddOn.addOn;
        
        // Check in add-on config features
        if (addOn.config?.features) {
          const feature = addOn.config.features.find(f => f.key === featureKey);
          if (feature && feature.value) {
            hasFeature = true;
            addOnSource = addOn.name;
            break;
          }
        }
        
        // Check in custom config override
        if (tenantAddOn.configOverride?.customConfig?.features) {
          const feature = tenantAddOn.configOverride.customConfig.features.find(f => f.key === featureKey);
          if (feature && feature.value) {
            hasFeature = true;
            addOnSource = addOn.name;
            break;
          }
        }
      }

      // Also check base subscription features (fallback)
      if (!hasFeature) {
        const tenant = await Tenancy.findById(tenantId);
        if (tenant && tenant.hasFeature(featureKey)) {
          hasFeature = true;
          addOnSource = 'base_plan';
        }
      }

      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          message: `This feature requires an add-on. Please purchase the ${featureKey.replace(/_/g, ' ')} add-on to access this functionality.`,
          feature: featureKey,
          available: false,
          suggestedAddOns: await getSuggestedAddOns(featureKey)
        });
      }

      // Attach feature info to request
      req.addOnFeature = {
        feature: featureKey,
        source: addOnSource,
        available: true
      };

      next();
    } catch (error) {
      console.error('Add-on feature check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check add-on feature access'
      });
    }
  };
};

/**
 * Middleware to check add-on usage limits and consume usage
 * Usage: checkAddOnUsage('sms_credits', 1)
 */
const checkAddOnUsage = (usageType, amount = 1) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenancy;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      // Find active usage-based add-ons for this usage type
      const activeAddOns = await TenantAddOn.find({
        tenant: tenantId,
        status: { $in: ['active', 'trial'] },
        billingCycle: 'usage-based',
        isDeleted: false
      }).populate('addOn');

      let availableCredits = 0;
      let addOnToUse = null;

      for (const tenantAddOn of activeAddOns) {
        const addOn = tenantAddOn.addOn;
        
        // Check if this add-on provides the required usage type
        if (addOn.config?.usage?.unit === usageType) {
          if (tenantAddOn.canUse(amount)) {
            availableCredits = tenantAddOn.usageTracking.remainingCredits;
            addOnToUse = tenantAddOn;
            break;
          }
        }
      }

      if (!addOnToUse || availableCredits < amount) {
        return res.status(403).json({
          success: false,
          message: `Insufficient ${usageType.replace(/_/g, ' ')} credits. You need ${amount} credits but have ${availableCredits} remaining.`,
          usageType,
          required: amount,
          available: availableCredits,
          suggestedAddOns: await getSuggestedAddOns(usageType)
        });
      }

      // Attach usage info to request for consumption after successful operation
      req.addOnUsage = {
        tenantAddOn: addOnToUse,
        usageType,
        amount,
        availableCredits
      };

      next();
    } catch (error) {
      console.error('Add-on usage check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check add-on usage'
      });
    }
  };
};

/**
 * Middleware to consume add-on usage after successful operation
 * Should be used after checkAddOnUsage
 */
const consumeAddOnUsage = () => {
  return async (req, res, next) => {
    try {
      if (req.addOnUsage) {
        const { tenantAddOn, amount, usageType } = req.addOnUsage;
        
        await tenantAddOn.consumeUsage(amount, {
          endpoint: req.originalUrl,
          method: req.method,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          timestamp: new Date()
        });

        console.log(`✅ Consumed ${amount} ${usageType} credits for tenant ${tenantAddOn.tenant}`);
      }

      next();
    } catch (error) {
      console.error('Add-on usage consumption error:', error);
      // Don't fail the request, just log the error
      next();
    }
  };
};

/**
 * Middleware to check add-on capacity limits
 * Usage: checkAddOnCapacity('max_branches', Branch, { tenancy: req.user.tenancy })
 */
const checkAddOnCapacity = (capacityKey, Model, queryBuilder) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenancy;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      // Get base plan limits
      const tenant = await Tenancy.findById(tenantId);
      let baseLimit = tenant.getFeatureValue(capacityKey, 0);

      // Get additional capacity from add-ons
      const activeAddOns = await TenantAddOn.findActiveByTenant(tenantId);
      let additionalCapacity = 0;

      for (const tenantAddOn of activeAddOns) {
        const addOn = tenantAddOn.addOn;
        
        // Check if this add-on provides additional capacity
        if (addOn.config?.capacity?.feature === capacityKey) {
          const increment = addOn.config.capacity.increment || 0;
          const quantity = tenantAddOn.quantity || 1;
          additionalCapacity += increment * quantity;
        }
        
        // Check custom config override
        if (tenantAddOn.configOverride?.customLimits?.has(capacityKey)) {
          additionalCapacity += tenantAddOn.configOverride.customLimits.get(capacityKey);
        }
      }

      const totalLimit = baseLimit + additionalCapacity;

      // If unlimited (-1), allow
      if (totalLimit === -1) {
        req.addOnCapacity = {
          feature: capacityKey,
          baseLimit,
          additionalCapacity,
          totalLimit: 'unlimited',
          unlimited: true
        };
        return next();
      }

      // Build query to count existing resources
      const query = typeof queryBuilder === 'function' 
        ? queryBuilder(req) 
        : queryBuilder;

      // Count existing resources
      const currentCount = await Model.countDocuments(query);

      console.log(`🔍 Add-on capacity check for ${capacityKey}:`, {
        baseLimit,
        additionalCapacity,
        totalLimit,
        currentCount,
        canCreate: currentCount < totalLimit
      });

      // Check if limit exceeded
      if (currentCount >= totalLimit) {
        const resourceName = capacityKey.replace('max_', '').replace(/_/g, ' ');

        return res.status(403).json({
          success: false,
          message: `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} limit exceeded. Your current limit is ${totalLimit} (${baseLimit} from plan + ${additionalCapacity} from add-ons). Please purchase additional capacity add-ons.`,
          capacity: {
            feature: capacityKey,
            baseLimit,
            additionalCapacity,
            totalLimit,
            current: currentCount,
            exceeded: true
          },
          suggestedAddOns: await getSuggestedAddOns(capacityKey)
        });
      }

      // Attach capacity info to request
      req.addOnCapacity = {
        feature: capacityKey,
        baseLimit,
        additionalCapacity,
        totalLimit,
        current: currentCount,
        remaining: totalLimit - currentCount
      };

      next();
    } catch (error) {
      console.error('Add-on capacity check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check add-on capacity'
      });
    }
  };
};

/**
 * Get tenant's effective limits including add-ons
 */
const getTenantLimits = async (req, res) => {
  try {
    const tenantId = req.user?.tenancy;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const tenant = await Tenancy.findById(tenantId);
    const activeAddOns = await TenantAddOn.findActiveByTenant(tenantId);

    // Get base plan features and limits
    const baseLimits = tenant.subscription?.features || {};
    const effectiveLimits = { ...baseLimits };

    // Apply add-on modifications
    const addOnSources = {};

    for (const tenantAddOn of activeAddOns) {
      const addOn = tenantAddOn.addOn;
      
      // Apply capacity increases
      if (addOn.config?.capacity) {
        const { feature, increment } = addOn.config.capacity;
        const quantity = tenantAddOn.quantity || 1;
        
        if (effectiveLimits[feature]) {
          effectiveLimits[feature] += increment * quantity;
        } else {
          effectiveLimits[feature] = increment * quantity;
        }
        
        addOnSources[feature] = addOnSources[feature] || [];
        addOnSources[feature].push({
          addOn: addOn.name,
          increment: increment * quantity
        });
      }
      
      // Apply feature unlocks
      if (addOn.config?.features) {
        for (const feature of addOn.config.features) {
          effectiveLimits[feature.key] = feature.value;
          addOnSources[feature.key] = addOnSources[feature.key] || [];
          addOnSources[feature.key].push({
            addOn: addOn.name,
            value: feature.value
          });
        }
      }
      
      // Apply custom overrides
      if (tenantAddOn.configOverride?.customLimits) {
        for (const [key, value] of tenantAddOn.configOverride.customLimits) {
          effectiveLimits[key] = value;
          addOnSources[key] = addOnSources[key] || [];
          addOnSources[key].push({
            addOn: addOn.name,
            value,
            source: 'custom_override'
          });
        }
      }
    }

    // Get usage-based add-ons
    const usageAddOns = activeAddOns
      .filter(ta => ta.billingCycle === 'usage-based')
      .map(ta => ({
        name: ta.addOn.name,
        type: ta.addOn.config?.usage?.unit,
        totalCredits: ta.usageTracking.totalUsed + ta.usageTracking.remainingCredits,
        usedCredits: ta.usageTracking.totalUsed,
        remainingCredits: ta.usageTracking.remainingCredits,
        autoRenew: ta.usageTracking.autoRenew,
        lowBalanceThreshold: ta.usageTracking.renewalThreshold
      }));

    return res.json({
      success: true,
      data: {
        plan: tenant.subscription?.plan || 'free',
        baseLimits,
        effectiveLimits,
        addOnSources,
        usageAddOns,
        activeAddOnsCount: activeAddOns.length,
        summary: {
          totalAddOns: activeAddOns.length,
          capacityAddOns: activeAddOns.filter(ta => ta.addOn.category === 'capacity').length,
          featureAddOns: activeAddOns.filter(ta => ta.addOn.category === 'feature').length,
          usageAddOns: usageAddOns.length
        }
      }
    });
  } catch (error) {
    console.error('Get tenant limits error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant limits'
    });
  }
};

/**
 * Helper function to get suggested add-ons for a feature/usage type
 */
const getSuggestedAddOns = async (featureOrUsageType) => {
  try {
    const addOns = await AddOn.find({
      status: 'active',
      showOnMarketplace: true,
      isDeleted: false,
      $or: [
        { 'config.features.key': featureOrUsageType },
        { 'config.usage.unit': featureOrUsageType },
        { 'config.capacity.feature': featureOrUsageType }
      ]
    }).select('name displayName description pricing category').limit(3);

    return addOns.map(addOn => ({
      id: addOn._id,
      name: addOn.name,
      displayName: addOn.displayName,
      description: addOn.description,
      category: addOn.category,
      pricing: addOn.formattedPricing
    }));
  } catch (error) {
    console.error('Error getting suggested add-ons:', error);
    return [];
  }
};

/**
 * Middleware to track add-on feature usage for analytics
 */
const trackAddOnUsage = (featureKey) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenancy;
      
      if (tenantId && req.addOnFeature?.source !== 'base_plan') {
        // Find the add-on that provided this feature
        const tenantAddOn = await TenantAddOn.findOne({
          tenant: tenantId,
          status: { $in: ['active', 'trial'] },
          isDeleted: false
        }).populate({
          path: 'addOn',
          match: {
            'config.features.key': featureKey
          }
        });

        if (tenantAddOn && tenantAddOn.addOn) {
          // Update feature usage analytics
          const featureUsageKey = `analytics.featureUsage.${featureKey}`;
          await TenantAddOn.updateOne(
            { _id: tenantAddOn._id },
            {
              $inc: { [`${featureUsageKey}.count`]: 1 },
              $set: { 
                [`${featureUsageKey}.lastUsed`]: new Date(),
                'analytics.lastUsed': new Date()
              }
            }
          );
        }
      }

      next();
    } catch (error) {
      console.error('Add-on usage tracking error:', error);
      // Don't fail the request, just log the error
      next();
    }
  };
};

/**
 * Middleware to check if tenant can purchase a specific add-on
 */
const checkAddOnEligibility = async (req, res, next) => {
  try {
    const { addOnId } = req.params;
    const tenantId = req.user?.tenancy;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const [addOn, tenant, existingAddOn] = await Promise.all([
      AddOn.findById(addOnId),
      Tenancy.findById(tenantId),
      TenantAddOn.findByTenantAndAddOn(tenantId, addOnId)
    ]);

    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    if (addOn.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Add-on is not available for purchase'
      });
    }

    // Check if already purchased (for single-instance add-ons)
    if (existingAddOn && addOn.maxQuantity === 1) {
      return res.status(400).json({
        success: false,
        message: 'You already have this add-on'
      });
    }

    // Check eligibility rules
    const eligibility = addOn.isEligibleForTenant(tenant);
    if (!eligibility.eligible) {
      return res.status(403).json({
        success: false,
        message: eligibility.reason,
        eligible: false
      });
    }

    // Attach add-on and tenant to request
    req.addOnPurchase = {
      addOn,
      tenant,
      existingAddOn,
      eligible: true
    };

    next();
  } catch (error) {
    console.error('Add-on eligibility check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check add-on eligibility'
    });
  }
};

module.exports = {
  checkAddOnFeature,
  checkAddOnUsage,
  consumeAddOnUsage,
  checkAddOnCapacity,
  getTenantLimits,
  trackAddOnUsage,
  checkAddOnEligibility,
  getSuggestedAddOns
};