const mongoose = require('mongoose');

const blogCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  color: {
    type: String,
    default: '#3B82F6' // Default blue color
  },
  icon: {
    type: String, // Icon name from lucide-react
    default: 'FileText'
  },
  
  // Targeting options
  visibility: {
    type: String,
    enum: ['platform', 'tenant', 'both'],
    default: 'both'
  },
  
  // Ordering
  sortOrder: {
    type: Number,
    default: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Parent category for hierarchical structure
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogCategory',
    default: null
  },
  
  // Tenant-specific fields
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: false // null for platform categories, set for tenant categories
  }
}, {
  timestamps: true
});

// Indexes
blogCategorySchema.index({ slug: 1 });
blogCategorySchema.index({ visibility: 1, isActive: 1 });
blogCategorySchema.index({ sortOrder: 1 });
blogCategorySchema.index({ tenantId: 1, isActive: 1 }); // For tenant-specific queries

// Pre-save middleware to generate slug
blogCategorySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

// Virtual for post count
blogCategorySchema.virtual('postCount', {
  ref: 'BlogPost',
  localField: '_id',
  foreignField: 'category',
  count: true
});

module.exports = mongoose.model('BlogCategory', blogCategorySchema);