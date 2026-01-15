const mongoose = require('mongoose');

/**
 * FeatureDefinition Model
 * Defines all available features that can be toggled on/off per billing plan
 * SuperAdmin can add new features dynamically
 */
const featureDefinitionSchema = new mongoose.Schema({
  // Unique key used in code (e.g., 'campaigns', 'wash_fold')
  key: {
    type: String,
    required: [true, 'Feature key is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z][a-z0-9_]*$/, 'Key must start with letter, contain only lowercase letters, numbers, underscores']
  },
  
  // Display name (e.g., 'Campaigns', 'Wash & Fold')
  name: {
    type: String,
    required: [true, 'Feature name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  // Description for SuperAdmin UI
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Category for grouping in UI
  category: {
    type: String,
    enum: ['admin_permissions', 'platform', 'limits', 'branding', 'support'],
    required: [true, 'Category is required']
  },
  
  // Value type determines how this feature is configured
  valueType: {
    type: String,
    enum: ['boolean', 'number'],
    default: 'boolean'
  },
  
  // Default value when creating new plans (all OFF by default for boolean)
  defaultValue: {
    type: mongoose.Schema.Types.Mixed,
    default: false
  },
  
  // For number types, optional min/max constraints
  constraints: {
    min: { type: Number },
    max: { type: Number },
    unlimitedValue: { type: Number, default: -1 } // Value that represents "unlimited"
  },
  
  // Whether this feature is active and available for plans
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Whether this is a system feature (cannot be deleted)
  isSystem: {
    type: Boolean,
    default: false
  },
  
  // Sort order for UI display
  sortOrder: {
    type: Number,
    default: 0
  },
  
  // Icon name for UI (optional)
  icon: {
    type: String,
    trim: true
  },
  
  // Created by SuperAdmin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  }
}, {
  timestamps: true
});

// Indexes
featureDefinitionSchema.index({ key: 1 }, { unique: true });
featureDefinitionSchema.index({ category: 1, sortOrder: 1 });
featureDefinitionSchema.index({ isActive: 1 });

// Static method to get all active features grouped by category
featureDefinitionSchema.statics.getActiveGrouped = async function() {
  const features = await this.find({ isActive: true }).sort({ category: 1, sortOrder: 1 });
  
  const grouped = {
    admin_permissions: [],
    platform: [],
    limits: [],
    branding: [],
    support: []
  };
  
  features.forEach(f => {
    if (grouped[f.category]) {
      grouped[f.category].push(f);
    }
  });
  
  return grouped;
};

// Static method to get default features map for new plans
featureDefinitionSchema.statics.getDefaultFeaturesMap = async function() {
  const features = await this.find({ isActive: true });
  const map = {};
  
  features.forEach(f => {
    map[f.key] = f.defaultValue;
  });
  
  return map;
};

module.exports = mongoose.model('FeatureDefinition', featureDefinitionSchema);
