const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema({
  // Tenancy Reference (Multi-tenant support)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },
  
  // Review ID for easy reference
  reviewId: {
    type: String,
    unique: true,
    index: true
  },
  
  // Customer who wrote the review
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Branch being reviewed
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  
  // Related order (optional - for verified purchase badge)
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Ratings (1-5 stars)
  ratings: {
    overall: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    serviceQuality: {
      type: Number,
      min: 1,
      max: 5,
      default: undefined
    },
    deliverySpeed: {
      type: Number,
      min: 1,
      max: 5,
      default: undefined
    },
    cleanliness: {
      type: Number,
      min: 1,
      max: 5,
      default: undefined
    },
    valueForMoney: {
      type: Number,
      min: 1,
      max: 5,
      default: undefined
    },
    staffBehavior: {
      type: Number,
      min: 1,
      max: 5,
      default: undefined
    }
  },
  
  // Review content
  title: {
    type: String,
    maxlength: 100,
    trim: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  
  // Photos uploaded with review
  photos: [{
    url: String,
    thumbnail: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Helpful votes
  helpfulVotes: {
    type: Number,
    default: 0
  },
  notHelpfulVotes: {
    type: Number,
    default: 0
  },
  votedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vote: { type: String, enum: ['helpful', 'not_helpful'] },
    votedAt: { type: Date, default: Date.now }
  }],
  
  // Branch owner reply
  reply: {
    content: {
      type: String,
      maxlength: 500
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    repliedAt: Date,
    isEdited: { type: Boolean, default: false },
    editedAt: Date
  },
  
  // Moderation
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'hidden'],
    default: 'approved'
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CenterAdmin'
  },
  moderatedAt: Date,
  moderationReason: String,
  
  // Flags for inappropriate content
  flags: [{
    flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: {
      type: String,
      enum: ['spam', 'inappropriate', 'fake', 'offensive', 'other']
    },
    description: String,
    flaggedAt: { type: Date, default: Date.now }
  }],
  flagCount: {
    type: Number,
    default: 0
  },
  
  // Badges
  badges: [{
    type: String,
    enum: ['verified_purchase', 'top_reviewer', 'helpful_reviewer', 'first_review']
  }],
  
  // Visibility
  isVisible: {
    type: Boolean,
    default: true
  },
  
  // Edit history
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    previousContent: String,
    previousRatings: Object,
    editedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
})

// Indexes
reviewSchema.index({ branch: 1, status: 1, createdAt: -1 })
reviewSchema.index({ customer: 1, createdAt: -1 })
reviewSchema.index({ 'ratings.overall': -1 })
reviewSchema.index({ helpfulVotes: -1 })
reviewSchema.index({ flagCount: 1, status: 1 })

// Generate unique review ID
reviewSchema.pre('save', async function(next) {
  if (!this.reviewId) {
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    this.reviewId = `REV${timestamp}${random}`
  }
  
  // Add verified purchase badge if order exists
  if (this.order && !this.badges.includes('verified_purchase')) {
    this.badges.push('verified_purchase')
  }
  
  next()
})

// Methods
reviewSchema.methods.addVote = async function(userId, voteType) {
  // Check if user already voted
  const existingVote = this.votedBy.find(v => v.user.equals(userId))
  
  if (existingVote) {
    // If same vote, remove it (toggle)
    if (existingVote.vote === voteType) {
      this.votedBy = this.votedBy.filter(v => !v.user.equals(userId))
      if (voteType === 'helpful') {
        this.helpfulVotes = Math.max(0, this.helpfulVotes - 1)
      } else {
        this.notHelpfulVotes = Math.max(0, this.notHelpfulVotes - 1)
      }
    } else {
      // Change vote
      existingVote.vote = voteType
      existingVote.votedAt = new Date()
      if (voteType === 'helpful') {
        this.helpfulVotes += 1
        this.notHelpfulVotes = Math.max(0, this.notHelpfulVotes - 1)
      } else {
        this.notHelpfulVotes += 1
        this.helpfulVotes = Math.max(0, this.helpfulVotes - 1)
      }
    }
  } else {
    // New vote
    this.votedBy.push({ user: userId, vote: voteType })
    if (voteType === 'helpful') {
      this.helpfulVotes += 1
    } else {
      this.notHelpfulVotes += 1
    }
  }
  
  return this.save()
}

reviewSchema.methods.addFlag = async function(userId, reason, description) {
  // Check if user already flagged
  const alreadyFlagged = this.flags.some(f => f.flaggedBy.equals(userId))
  if (alreadyFlagged) {
    throw new Error('You have already flagged this review')
  }
  
  this.flags.push({ flaggedBy: userId, reason, description })
  this.flagCount += 1
  
  // Auto-hide if too many flags
  if (this.flagCount >= 5) {
    this.status = 'hidden'
    this.isVisible = false
  }
  
  return this.save()
}

reviewSchema.methods.addReply = async function(userId, content) {
  this.reply = {
    content,
    repliedBy: userId,
    repliedAt: new Date(),
    isEdited: false
  }
  return this.save()
}

reviewSchema.methods.editReply = async function(content) {
  if (!this.reply) {
    throw new Error('No reply to edit')
  }
  this.reply.content = content
  this.reply.isEdited = true
  this.reply.editedAt = new Date()
  return this.save()
}

// Static methods
reviewSchema.statics.getBranchStats = async function(branchId) {
  const stats = await this.aggregate([
    { $match: { branch: new mongoose.Types.ObjectId(branchId), status: 'approved', isVisible: true } },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        avgOverall: { $avg: '$ratings.overall' },
        avgServiceQuality: { $avg: '$ratings.serviceQuality' },
        avgDeliverySpeed: { $avg: '$ratings.deliverySpeed' },
        avgCleanliness: { $avg: '$ratings.cleanliness' },
        avgValueForMoney: { $avg: '$ratings.valueForMoney' },
        avgStaffBehavior: { $avg: '$ratings.staffBehavior' },
        fiveStars: { $sum: { $cond: [{ $eq: ['$ratings.overall', 5] }, 1, 0] } },
        fourStars: { $sum: { $cond: [{ $eq: ['$ratings.overall', 4] }, 1, 0] } },
        threeStars: { $sum: { $cond: [{ $eq: ['$ratings.overall', 3] }, 1, 0] } },
        twoStars: { $sum: { $cond: [{ $eq: ['$ratings.overall', 2] }, 1, 0] } },
        oneStar: { $sum: { $cond: [{ $eq: ['$ratings.overall', 1] }, 1, 0] } }
      }
    }
  ])
  
  if (stats.length === 0) {
    return {
      totalReviews: 0,
      avgOverall: 0,
      avgServiceQuality: 0,
      avgDeliverySpeed: 0,
      avgCleanliness: 0,
      avgValueForMoney: 0,
      avgStaffBehavior: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    }
  }
  
  const result = stats[0]
  return {
    totalReviews: result.totalReviews,
    avgOverall: Math.round(result.avgOverall * 10) / 10,
    avgServiceQuality: Math.round((result.avgServiceQuality || 0) * 10) / 10,
    avgDeliverySpeed: Math.round((result.avgDeliverySpeed || 0) * 10) / 10,
    avgCleanliness: Math.round((result.avgCleanliness || 0) * 10) / 10,
    avgValueForMoney: Math.round((result.avgValueForMoney || 0) * 10) / 10,
    avgStaffBehavior: Math.round((result.avgStaffBehavior || 0) * 10) / 10,
    distribution: {
      5: result.fiveStars,
      4: result.fourStars,
      3: result.threeStars,
      2: result.twoStars,
      1: result.oneStar
    }
  }
}

module.exports = mongoose.model('Review', reviewSchema)
