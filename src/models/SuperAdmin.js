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

const superAdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'superadmin' },
  
  // Session Management
  sessions: [sessionSchema],
  
  // Security Settings
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  lastLoginIP: { type: String },
  lastActivity: { type: Date, default: Date.now },
  
  // Password Reset
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  
  // Full permissions (SuperAdmin has all)
  permissions: {
    branches: { type: Boolean, default: true },
    users: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    finances: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    settings: { type: Boolean, default: true },
    admins: { type: Boolean, default: true },
    pricing: { type: Boolean, default: true },
    audit: { type: Boolean, default: true }
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
superAdminSchema.index({ email: 1 })

// Pre-save middleware to hash password
superAdminSchema.pre('save', async function(next) {
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
superAdminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Method to add session
superAdminSchema.methods.addSession = function(sessionData) {
  const session = {
    sessionId: sessionData.sessionId,
    ipAddress: sessionData.ipAddress || 'unknown',
    userAgent: sessionData.userAgent || 'unknown',
    location: sessionData.location,
    isActive: true,
    lastActivity: new Date(),
    createdAt: new Date(),
    expiresAt: sessionData.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
  this.sessions.push(session)
  return this.save()
}

// Method to remove session
superAdminSchema.methods.removeSession = function(sessionId) {
  this.sessions = this.sessions.filter(session => session.sessionId !== sessionId)
  return this.save()
}

// Method to clean expired sessions
superAdminSchema.methods.cleanExpiredSessions = function() {
  const now = new Date()
  this.sessions = this.sessions.filter(session => session.expiresAt > now)
  return this.save()
}

// Method to increment login attempts
superAdminSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    })
  }
  // Otherwise increment
  const updates = { $inc: { loginAttempts: 1 } }
  // Lock the account if we've reached max attempts
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 } // 2 hour lock
  }
  return this.updateOne(updates)
}

// Method to reset login attempts
superAdminSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  })
}

module.exports = mongoose.model('SuperAdmin', superAdminSchema)
