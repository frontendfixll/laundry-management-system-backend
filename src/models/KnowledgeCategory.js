const mongoose = require('mongoose');

const knowledgeCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: 'blue',
    enum: ['blue', 'green', 'purple', 'orange', 'red', 'yellow', 'indigo', 'pink']
  },
  icon: {
    type: String,
    default: 'BookOpen'
  },
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Ensure unique category names per tenancy
knowledgeCategorySchema.index({ name: 1, tenancy: 1 }, { unique: true });

module.exports = mongoose.model('KnowledgeCategory', knowledgeCategorySchema);