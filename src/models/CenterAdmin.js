const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  location: { type: String },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
})

const mfaSchema = new mongoose.Schema({
  secret: { type: String },
  isEnabled: { type: Boolean, default: false },
  backupCodes: [{ type: String }],
  lastUsed: { type: Date }
})

const centerAdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'center_admin' },
  
  // MFA Configuration
  mfa: mfaSchema,
  
  // Session Management
  sessions: [sessionSchema],
  
  // Security Settings
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  lastLoginIP: { type: String },
  
  // Permissions
  permissions: {
    branches: { type: Boolean, default: true },
    users: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    finances: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    settings: { type: Boolean, default: true }
  },
  
  // Profile
  phone: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  
  // Audit
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// Indexes
centerAdminSchema.index({ email: 1 })
centerAdminSchema.index({ 'sessions.sessionId': 1 })
centerAdminSchema.index({ 'sessions.isActive': 1 })

// Virtual for account lock status
centerAdminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now())
})

// Pre-save middleware to hash password
centerAdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  
  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Method to compare password
centerAdminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Method to increment login attempts
centerAdminSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    })
  }
  
  const updates = { $inc: { loginAttempts: 1 } }
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 } // 2 hours
  }
  
  return this.updateOne(updates)
}

// Method to reset login attempts
centerAdminSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  })
}

// Method to add session
centerAdminSchema.methods.addSession = function(sessionData) {
  const session = {
    sessionId: sessionData.sessionId,
    ipAddress: sessionData.ipAddress,
    userAgent: sessionData.userAgent,
    location: sessionData.location,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  }
  
  this.sessions.push(session)
  return this.save()
}

// Method to remove session
centerAdminSchema.methods.removeSession = function(sessionId) {
  this.sessions = this.sessions.filter(session => session.sessionId !== sessionId)
  return this.save()
}

// Method to clean expired sessions
centerAdminSchema.methods.cleanExpiredSessions = function() {
  const now = new Date()
  this.sessions = this.sessions.filter(session => session.expiresAt > now)
  return this.save()
}

module.exports = mongoose.model('CenterAdmin', centerAdminSchema)