const mongoose = require('mongoose');

const branchServiceSchema = new mongoose.Schema({
  // Reference to the branch
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  
  // Reference to the service
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    index: true
  },
  
  // Whether this service is enabled for this branch
  isEnabled: {
    type: Boolean,
    default: true
  },
  
  // Branch-specific pricing multiplier (optional override)
  priceMultiplier: {
    type: Number,
    default: 1.0,
    min: 0.1,
    max: 10.0
  },
  
  // Branch-specific turnaround time (optional override)
  turnaroundTimeOverride: {
    hours: {
      type: Number,
      min: 1,
      max: 168 // 1 week max
    },
    minutes: {
      type: Number,
      min: 0,
      max: 59,
      default: 0
    }
  },
  
  // Whether express service is available for this branch
  isExpressAvailable: {
    type: Boolean,
    default: true
  },
  
  // Branch-specific notes or instructions
  notes: {
    type: String,
    maxlength: 500
  },
  
  // Tenancy reference for multi-tenant isolation
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per branch-service combination
branchServiceSchema.index({ branch: 1, service: 1 }, { unique: true });

// Index for tenancy-based queries
branchServiceSchema.index({ tenancy: 1, isEnabled: 1 });

// Static method to get enabled services for a branch
branchServiceSchema.statics.getEnabledServicesForBranch = async function(branchId) {
  return this.find({ 
    branch: branchId, 
    isEnabled: true 
  }).populate('service');
};

// Static method to bulk enable/disable services for a branch
branchServiceSchema.statics.bulkUpdateBranchServices = async function(branchId, serviceUpdates, userId) {
  const operations = serviceUpdates.map(update => ({
    updateOne: {
      filter: { branch: branchId, service: update.serviceId },
      update: {
        isEnabled: update.isEnabled,
        priceMultiplier: update.priceMultiplier || 1.0,
        turnaroundTimeOverride: update.turnaroundTimeOverride,
        isExpressAvailable: update.isExpressAvailable !== undefined ? update.isExpressAvailable : true,
        notes: update.notes,
        updatedBy: userId
      },
      upsert: true
    }
  }));
  
  return this.bulkWrite(operations);
};

// Instance method to toggle service status
branchServiceSchema.methods.toggle = function() {
  this.isEnabled = !this.isEnabled;
  return this.save();
};

module.exports = mongoose.model('BranchService', branchServiceSchema);