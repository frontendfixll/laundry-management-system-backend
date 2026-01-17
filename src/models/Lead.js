const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  // Business Information
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  businessType: {
    type: String,
    enum: ['small_laundry', 'chain', 'dry_cleaner', 'laundry', 'dry_cleaning', 'hotel', 'hospital', 'other'],
    default: 'laundry'
  },
  
  // Contact Information
  contactPerson: {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, required: true },
    designation: { type: String }
  },
  
  // Address
  address: {
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    country: { type: String, default: 'India' }
  },
  
  // Lead Status
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'demo_scheduled', 'demo_completed', 'negotiation', 'converted', 'lost', 'on_hold'],
    default: 'new'
  },
  
  // Lead Source
  source: {
    type: String,
    enum: ['website', 'pricing_page', 'referral', 'cold_call', 'email_campaign', 'social_media', 'event', 'partner', 'other'],
    default: 'website'
  },
  
  // Trial Information
  trial: {
    isActive: { type: Boolean, default: false },
    startDate: { type: Date },
    endDate: { type: Date },
    daysRemaining: { type: Number, default: 0 },
    extensionCount: { type: Number, default: 0 },
    lastExtendedDate: { type: Date }
  },
  
  // Plan Interest
  interestedPlan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise', 'custom', 'undecided'],
    default: 'undecided'
  },
  estimatedRevenue: { type: Number, default: 0 },
  
  // Requirements
  requirements: {
    numberOfBranches: { type: Number, default: 1 },
    expectedOrders: { type: Number, default: 0 },
    staffCount: { type: Number, default: 0 },
    features: [{ type: String }],
    notes: { type: String }
  },
  
  // Sales Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesUser'
  },
  assignedDate: { type: Date },
  
  // Follow-up
  nextFollowUp: { type: Date },
  lastContactedDate: { type: Date },
  followUpNotes: [
    {
      note: { type: String },
      date: { type: Date, default: Date.now },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SalesUser'
      }
    }
  ],
  
  // Conversion
  isConverted: { type: Boolean, default: false },
  convertedDate: { type: Date },
  tenancyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy'
  },
  
  // Lost Reason
  lostReason: {
    type: String,
    enum: ['price_too_high', 'competitor', 'not_interested', 'timing', 'features_missing', 'other']
  },
  lostNotes: { type: String },
  lostDate: { type: Date },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Score (Lead scoring)
  score: { type: Number, default: 0, min: 0, max: 100 },
  
  // Tags
  tags: [{ type: String }],
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'createdByModel'
  },
  createdByModel: {
    type: String,
    enum: ['SalesUser', 'SuperAdmin'],
    default: 'SalesUser'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'updatedByModel'
  },
  updatedByModel: {
    type: String,
    enum: ['SalesUser', 'SuperAdmin']
  }
}, {
  timestamps: true
});

// Indexes
leadSchema.index({ status: 1, assignedTo: 1 });
leadSchema.index({ 'contactPerson.email': 1 });
leadSchema.index({ 'contactPerson.phone': 1 });
leadSchema.index({ nextFollowUp: 1 });
leadSchema.index({ createdAt: -1 });

// Calculate days remaining in trial
leadSchema.methods.updateTrialDaysRemaining = function() {
  if (this.trial.isActive && this.trial.endDate) {
    const now = new Date();
    const endDate = new Date(this.trial.endDate);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    this.trial.daysRemaining = Math.max(0, diffDays);
  } else {
    this.trial.daysRemaining = 0;
  }
  return this.save();
};

// Add follow-up note
leadSchema.methods.addFollowUpNote = function(note, userId) {
  this.followUpNotes.push({
    note,
    addedBy: userId,
    date: new Date()
  });
  this.lastContactedDate = new Date();
  return this.save();
};

// Convert lead to customer
leadSchema.methods.convertToCustomer = function(tenancyId) {
  this.isConverted = true;
  this.convertedDate = new Date();
  this.tenancyId = tenancyId;
  this.status = 'converted';
  return this.save();
};

// Mark as lost
leadSchema.methods.markAsLost = function(reason, notes) {
  this.status = 'lost';
  this.lostReason = reason;
  this.lostNotes = notes;
  this.lostDate = new Date();
  return this.save();
};

// Calculate lead score (simple scoring algorithm)
leadSchema.methods.calculateScore = function() {
  let score = 0;
  
  // Status score
  const statusScores = {
    'new': 10,
    'contacted': 20,
    'qualified': 40,
    'demo_scheduled': 60,
    'demo_completed': 70,
    'negotiation': 85,
    'converted': 100,
    'lost': 0,
    'on_hold': 30
  };
  score += statusScores[this.status] || 0;
  
  // Engagement score (follow-ups)
  if (this.followUpNotes.length > 0) {
    score += Math.min(this.followUpNotes.length * 5, 20);
  }
  
  // Revenue potential
  if (this.estimatedRevenue > 50000) score += 15;
  else if (this.estimatedRevenue > 20000) score += 10;
  else if (this.estimatedRevenue > 10000) score += 5;
  
  // Requirements (branches)
  if (this.requirements.numberOfBranches > 5) score += 10;
  else if (this.requirements.numberOfBranches > 2) score += 5;
  
  // Recency (last contacted)
  if (this.lastContactedDate) {
    const daysSinceContact = Math.floor((Date.now() - this.lastContactedDate) / (1000 * 60 * 60 * 24));
    if (daysSinceContact < 7) score += 10;
    else if (daysSinceContact < 14) score += 5;
  }
  
  this.score = Math.min(score, 100);
  return this.save();
};

module.exports = mongoose.model('Lead', leadSchema);
