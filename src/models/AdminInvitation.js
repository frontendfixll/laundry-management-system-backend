const mongoose = require('mongoose')
const crypto = require('crypto')

const adminInvitationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'center_admin'],
    required: true
  },
  permissions: {
    type: Object,
    required: true
  },
  assignedBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  invitationToken: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired'],
    default: 'pending'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'invitedByModel',
    required: true
  },
  invitedByModel: {
    type: String,
    enum: ['SuperAdmin', 'CenterAdmin'],
    required: true
  },
  acceptedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Generate secure invitation token
adminInvitationSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex')
}

// Check if invitation is valid
adminInvitationSchema.methods.isValid = function() {
  return this.status === 'pending' && this.expiresAt > new Date()
}

// Mark as accepted
adminInvitationSchema.methods.markAccepted = async function() {
  this.status = 'accepted'
  this.acceptedAt = new Date()
  await this.save()
}

// Mark expired invitations
adminInvitationSchema.statics.markExpired = async function() {
  await this.updateMany(
    { status: 'pending', expiresAt: { $lt: new Date() } },
    { status: 'expired' }
  )
}

module.exports = mongoose.model('AdminInvitation', adminInvitationSchema)
