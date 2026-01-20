const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  visibility: {
    type: String,
    enum: ['public', 'internal', 'tenancy'],
    default: 'tenancy'
  },
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  isHelpful: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    helpful: {
      type: Boolean,
      default: true
    }
  }],
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String
  }],
  relatedArticles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KnowledgeBase'
  }],
  searchKeywords: [{
    type: String,
    trim: true
  }],
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better search performance
knowledgeBaseSchema.index({ tenancy: 1, status: 1 });
knowledgeBaseSchema.index({ category: 1, tenancy: 1 });
knowledgeBaseSchema.index({ tags: 1, tenancy: 1 });
knowledgeBaseSchema.index({ 
  title: 'text', 
  content: 'text', 
  tags: 'text',
  searchKeywords: 'text'
});

// Virtual for helpful percentage
knowledgeBaseSchema.virtual('helpfulPercentage').get(function() {
  if (this.isHelpful.length === 0) return 0;
  const helpful = this.isHelpful.filter(item => item.helpful).length;
  return Math.round((helpful / this.isHelpful.length) * 100);
});

// Method to increment views
knowledgeBaseSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Method to mark as helpful/not helpful
knowledgeBaseSchema.methods.markHelpful = function(userId, isHelpful) {
  const existingIndex = this.isHelpful.findIndex(item => 
    item.user.toString() === userId.toString()
  );
  
  if (existingIndex > -1) {
    this.isHelpful[existingIndex].helpful = isHelpful;
  } else {
    this.isHelpful.push({ user: userId, helpful: isHelpful });
  }
  
  return this.save();
};

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);