const { DELIVERY_PRICING_DEFAULTS } = require('../config/constants');

/**
 * Delivery Pricing Service
 * Calculates delivery charges based on distance and configurable pricing rules
 */
class DeliveryPricingService {
  constructor() {
    // Default pricing config (can be overridden from database)
    this.defaultConfig = {
      baseDistance: DELIVERY_PRICING_DEFAULTS.BASE_DISTANCE,
      perKmRate: DELIVERY_PRICING_DEFAULTS.PER_KM_RATE,
      maxDistance: DELIVERY_PRICING_DEFAULTS.MAX_DISTANCE,
      minimumCharge: DELIVERY_PRICING_DEFAULTS.MINIMUM_CHARGE,
      expressMultiplier: DELIVERY_PRICING_DEFAULTS.EXPRESS_MULTIPLIER,
      fallbackFlatRate: DELIVERY_PRICING_DEFAULTS.FALLBACK_FLAT_RATE
    };
  }

  /**
   * Calculate delivery charge based on distance
   * Formula: 
   * - If distance <= baseDistance: minimumCharge (or 0)
   * - If distance > baseDistance: max(minimumCharge, (distance - baseDistance) * perKmRate)
   * 
   * @param {number} distance - Distance in kilometers
   * @param {Object} config - Pricing configuration
   * @param {boolean} isExpress - Whether this is an express order
   * @returns {{ charge: number, breakdown: Object, isServiceable: boolean }}
   */
  calculateDeliveryCharge(distance, config = {}, isExpress = false) {
    // Merge with defaults
    const pricingConfig = { ...this.defaultConfig, ...config };
    
    const {
      baseDistance,
      perKmRate,
      maxDistance,
      minimumCharge,
      expressMultiplier
    } = pricingConfig;

    // Validate distance
    if (typeof distance !== 'number' || distance < 0 || isNaN(distance)) {
      return {
        charge: 0,
        breakdown: { error: 'Invalid distance value' },
        isServiceable: false
      };
    }

    // Check serviceability
    const isServiceable = this.isServiceable(distance, maxDistance);
    
    if (!isServiceable) {
      return {
        charge: 0,
        breakdown: {
          distance,
          maxDistance,
          message: `Distance ${distance} km exceeds maximum serviceable distance of ${maxDistance} km`
        },
        isServiceable: false
      };
    }

    let charge = 0;
    let chargeableDistance = 0;

    if (distance <= baseDistance) {
      // Within free delivery zone
      charge = minimumCharge;
      chargeableDistance = 0;
    } else {
      // Beyond base distance
      chargeableDistance = Math.round((distance - baseDistance) * 100) / 100;
      const calculatedCharge = chargeableDistance * perKmRate;
      charge = Math.max(minimumCharge, calculatedCharge);
    }

    // Apply express multiplier
    if (isExpress && expressMultiplier > 1) {
      charge = Math.round(charge * expressMultiplier);
    }

    // Round to nearest rupee
    charge = Math.round(charge);

    return {
      charge,
      breakdown: {
        distance: Math.round(distance * 100) / 100,
        baseDistance,
        chargeableDistance,
        perKmRate,
        minimumCharge,
        isExpress,
        expressMultiplier: isExpress ? expressMultiplier : 1,
        calculationMethod: distance <= baseDistance ? 'FREE_ZONE' : 'PER_KM'
      },
      isServiceable: true
    };
  }

  /**
   * Check if distance is within serviceable range
   * @param {number} distance - Distance in kilometers
   * @param {number} maxDistance - Maximum serviceable distance
   * @returns {boolean}
   */
  isServiceable(distance, maxDistance = this.defaultConfig.maxDistance) {
    if (typeof distance !== 'number' || typeof maxDistance !== 'number') {
      return false;
    }
    return distance >= 0 && distance <= maxDistance;
  }

  /**
   * Get fallback flat rate for when API fails
   * @param {boolean} isExpress - Whether this is an express order
   * @returns {{ charge: number, breakdown: Object }}
   */
  getFallbackCharge(isExpress = false) {
    let charge = this.defaultConfig.fallbackFlatRate;
    
    if (isExpress) {
      charge = Math.round(charge * this.defaultConfig.expressMultiplier);
    }

    return {
      charge,
      breakdown: {
        type: 'FALLBACK_FLAT_RATE',
        message: 'Distance-based pricing temporarily unavailable. Flat rate applied.',
        isExpress,
        expressMultiplier: isExpress ? this.defaultConfig.expressMultiplier : 1
      },
      isServiceable: true,
      isFallback: true
    };
  }

  /**
   * Get current pricing configuration
   * In production, this would fetch from database
   * @returns {Object} Pricing configuration
   */
  getPricingConfig() {
    return { ...this.defaultConfig };
  }

  /**
   * Update pricing configuration
   * @param {Object} newConfig - New pricing values
   * @returns {Object} Updated configuration
   */
  updatePricingConfig(newConfig) {
    // Validate new config values
    const validatedConfig = this.validateConfig(newConfig);
    
    // Update config
    Object.assign(this.defaultConfig, validatedConfig);
    
    return { ...this.defaultConfig };
  }

  /**
   * Validate pricing configuration values
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validated configuration
   */
  validateConfig(config) {
    const validated = {};

    if (config.baseDistance !== undefined) {
      const val = parseFloat(config.baseDistance);
      if (!isNaN(val) && val >= 0 && val <= 50) {
        validated.baseDistance = val;
      }
    }

    if (config.perKmRate !== undefined) {
      const val = parseFloat(config.perKmRate);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        validated.perKmRate = val;
      }
    }

    if (config.maxDistance !== undefined) {
      const val = parseFloat(config.maxDistance);
      if (!isNaN(val) && val >= 1 && val <= 100) {
        validated.maxDistance = val;
      }
    }

    if (config.minimumCharge !== undefined) {
      const val = parseFloat(config.minimumCharge);
      if (!isNaN(val) && val >= 0 && val <= 500) {
        validated.minimumCharge = val;
      }
    }

    if (config.expressMultiplier !== undefined) {
      const val = parseFloat(config.expressMultiplier);
      if (!isNaN(val) && val >= 1 && val <= 3) {
        validated.expressMultiplier = val;
      }
    }

    if (config.fallbackFlatRate !== undefined) {
      const val = parseFloat(config.fallbackFlatRate);
      if (!isNaN(val) && val >= 0 && val <= 500) {
        validated.fallbackFlatRate = val;
      }
    }

    return validated;
  }

  /**
   * Calculate estimated delivery charge for display (before order)
   * @param {number} distance - Distance in km
   * @param {boolean} isExpress - Express order flag
   * @returns {Object} Estimated charge details
   */
  getEstimatedCharge(distance, isExpress = false) {
    const result = this.calculateDeliveryCharge(distance, {}, isExpress);
    
    return {
      estimatedCharge: result.charge,
      distance: distance,
      isServiceable: result.isServiceable,
      freeDeliveryWithin: this.defaultConfig.baseDistance,
      perKmRate: this.defaultConfig.perKmRate,
      maxServiceableDistance: this.defaultConfig.maxDistance,
      message: result.isServiceable 
        ? (distance <= this.defaultConfig.baseDistance 
            ? 'Free delivery!' 
            : `₹${result.charge} delivery charge`)
        : 'Area not serviceable'
    };
  }
}

// Export singleton instance
module.exports = new DeliveryPricingService();
