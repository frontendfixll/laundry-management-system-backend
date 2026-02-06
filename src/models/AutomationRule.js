const mongoose = require('mongoose');

const automationRuleSchema = new mongoose.Schema({
  ruleId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  scope: {
    type: String,
    enum: ['PLATFORM', 'TENANT'],
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: function() {
      return this.scope === 'TENANT';
    }
  },
  trigger: {
    eventType: {
      type: String,
      required: true
    },
    conditions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  actions: [{
    type: {
      type: String,
      required: true
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    delay: {
      type: Number,
      default: 0 // milliseconds
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 1
  },
  executionCount: {
    type: Number,
    default: 0
  },
  lastExecuted: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for performance
automationRuleSchema.index({ scope: 1, isActive: 1 });
automationRuleSchema.index({ tenantId: 1, isActive: 1 });
automationRuleSchema.index({ 'trigger.eventType': 1, isActive: 1 });

// Update updatedAt on save
automationRuleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('AutomationRule', automationRuleSchema);