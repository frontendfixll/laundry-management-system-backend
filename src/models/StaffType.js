const mongoose = require('mongoose');

const staffTypeSchema = new mongoose.Schema({
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Staff type name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  color: {
    type: String,
    default: '#6B7280',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color']
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound unique index - name must be unique within a branch
staffTypeSchema.index({ branch: 1, name: 1 }, { unique: true });

// Default staff types to create for new branches
staffTypeSchema.statics.DEFAULT_TYPES = [
  { name: 'Washer', description: 'Handles washing machines', color: '#3B82F6' },
  { name: 'Dry Cleaner', description: 'Dry cleaning specialist', color: '#8B5CF6' },
  { name: 'Ironer', description: 'Ironing and pressing', color: '#10B981' },
  { name: 'Packer', description: 'Packaging orders', color: '#F59E0B' },
  { name: 'Quality Checker', description: 'Quality inspection', color: '#EF4444' },
  { name: 'General', description: 'General tasks', color: '#6B7280' }
];

// Create default staff types for a branch
staffTypeSchema.statics.createDefaultsForBranch = async function(branchId) {
  const defaults = this.DEFAULT_TYPES.map(type => ({
    ...type,
    branch: branchId,
    isDefault: true
  }));
  
  return await this.insertMany(defaults, { ordered: false }).catch(err => {
    // Ignore duplicate key errors (types already exist)
    if (err.code !== 11000) throw err;
    return [];
  });
};

module.exports = mongoose.model('StaffType', staffTypeSchema);
