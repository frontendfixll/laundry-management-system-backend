const mongoose = require('mongoose');
const { DELIVERY_PRICING_DEFAULTS } = require('../config/constants');

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String
  },
  category: {
    type: String,
    enum: ['general', 'delivery', 'pricing', 'notifications', 'security', 'other'],
    default: 'general'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Static method to get a setting by key
settingsSchema.statics.getSetting = async function(key, defaultValue = null) {
  const setting = await this.findOne({ key, isActive: true });
  return setting ? setting.value : defaultValue;
};

// Static method to set a setting
settingsSchema.statics.setSetting = async function(key, value, options = {}) {
  const { description, category, updatedBy } = options;
  
  const setting = await this.findOneAndUpdate(
    { key },
    { 
      value, 
      description: description || undefined,
      category: category || 'general',
      updatedBy,
      isActive: true
    },
    { upsert: true, new: true }
  );
  
  return setting;
};

// Static method to get delivery pricing config
settingsSchema.statics.getDeliveryPricing = async function() {
  const setting = await this.findOne({ key: 'delivery_pricing', isActive: true });
  
  if (setting) {
    return setting.value;
  }
  
  // Return defaults if not configured
  return {
    baseDistance: DELIVERY_PRICING_DEFAULTS.BASE_DISTANCE,
    perKmRate: DELIVERY_PRICING_DEFAULTS.PER_KM_RATE,
    maxDistance: DELIVERY_PRICING_DEFAULTS.MAX_DISTANCE,
    minimumCharge: DELIVERY_PRICING_DEFAULTS.MINIMUM_CHARGE,
    expressMultiplier: DELIVERY_PRICING_DEFAULTS.EXPRESS_MULTIPLIER,
    fallbackFlatRate: DELIVERY_PRICING_DEFAULTS.FALLBACK_FLAT_RATE
  };
};

// Static method to update delivery pricing config
settingsSchema.statics.updateDeliveryPricing = async function(config, updatedBy) {
  // Validate config values
  const validatedConfig = {};
  
  if (config.baseDistance !== undefined) {
    const val = parseFloat(config.baseDistance);
    if (!isNaN(val) && val >= 0 && val <= 50) {
      validatedConfig.baseDistance = val;
    }
  }
  
  if (config.perKmRate !== undefined) {
    const val = parseFloat(config.perKmRate);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      validatedConfig.perKmRate = val;
    }
  }
  
  if (config.maxDistance !== undefined) {
    const val = parseFloat(config.maxDistance);
    if (!isNaN(val) && val >= 1 && val <= 100) {
      validatedConfig.maxDistance = val;
    }
  }
  
  if (config.minimumCharge !== undefined) {
    const val = parseFloat(config.minimumCharge);
    if (!isNaN(val) && val >= 0 && val <= 500) {
      validatedConfig.minimumCharge = val;
    }
  }
  
  if (config.expressMultiplier !== undefined) {
    const val = parseFloat(config.expressMultiplier);
    if (!isNaN(val) && val >= 1 && val <= 3) {
      validatedConfig.expressMultiplier = val;
    }
  }
  
  if (config.fallbackFlatRate !== undefined) {
    const val = parseFloat(config.fallbackFlatRate);
    if (!isNaN(val) && val >= 0 && val <= 500) {
      validatedConfig.fallbackFlatRate = val;
    }
  }
  
  // Get current config and merge
  const currentConfig = await this.getDeliveryPricing();
  const newConfig = { ...currentConfig, ...validatedConfig };
  
  // Save
  return this.setSetting('delivery_pricing', newConfig, {
    description: 'Distance-based delivery pricing configuration',
    category: 'delivery',
    updatedBy
  });
};

module.exports = mongoose.model('Settings', settingsSchema);
