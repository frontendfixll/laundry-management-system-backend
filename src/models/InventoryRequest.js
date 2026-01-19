const mongoose = require('mongoose');

const inventoryRequestSchema = new mongoose.Schema({
  tenancyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['Cleaning Chemicals', 'Dry Cleaning Chemicals', 'Packaging Materials', 'Equipment Supplies', 'Other'],
    default: 'Other'
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  estimatedQuantity: {
    type: String,
    default: 'Not specified'
  },
  unit: {
    type: String,
    enum: ['units', 'kg', 'liters', 'boxes', 'bottles', 'pieces'],
    default: 'units'
  },
  urgency: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal'
  },
  justification: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  adminNotes: {
    type: String
  },
  // SuperAdmin fields
  estimatedCost: {
    type: Number
  },
  supplier: {
    type: String
  },
  expectedDelivery: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
inventoryRequestSchema.index({ tenancyId: 1, status: 1 });
inventoryRequestSchema.index({ requestDate: -1 });

// Virtual for urgency display
inventoryRequestSchema.virtual('urgencyDisplay').get(function() {
  const urgencyMap = {
    low: 'Low Priority',
    normal: 'Normal',
    high: 'Urgent'
  };
  return urgencyMap[this.urgency] || 'Normal';
});

// Virtual for status display
inventoryRequestSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    pending: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
    completed: 'Completed'
  };
  return statusMap[this.status] || 'Unknown';
});

module.exports = mongoose.model('InventoryRequest', inventoryRequestSchema);