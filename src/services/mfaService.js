const crypto = require('crypto')
const { sendEmail } = require('../config/email')

class MFAService {
  constructor() {
    this.otpStore = new Map() // In production, use Redis
    this.otpExpiry = 10 * 60 * 1000 // 10 minutes
  }

  // Generate OTP
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  // Generate backup codes
  generateBackupCodes(count = 10) {
    const codes = []
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase())
    }
    return codes
  }

  // Send OTP via email
  async sendOTP(email, purpose = 'login') {
    try {
      const otp = this.generateOTP()
      const expiresAt = Date.now() + this.otpExpiry
      
      // Store OTP (in production, use Redis with TTL)
      const otpKey = `${email}:${purpose}`
      this.otpStore.set(otpKey, {
        otp,
        expiresAt,
        attempts: 0
      })

      // Email template
      const subject = purpose === 'login' ? 'Login Verification Code' : 'Security Verification Code'
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">LaundryLobby Admin</h1>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Verification Code</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.5;">
              Your verification code for ${purpose} is:
            </p>
            
            <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</span>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This is an automated message from LaundryLobby Admin System.
              </p>
            </div>
          </div>
        </div>
      `

      await sendEmail({
        to: email,
        subject,
        html
      })

      return {
        success: true,
        message: 'OTP sent successfully',
        expiresAt
      }
    } catch (error) {
      console.error('Failed to send OTP:', error)
      throw new Error('Failed to send verification code')
    }
  }

  // Verify OTP
  verifyOTP(email, otp, purpose = 'login') {
    const otpKey = `${email}:${purpose}`
    const storedData = this.otpStore.get(otpKey)

    if (!storedData) {
      return {
        success: false,
        message: 'No verification code found. Please request a new one.'
      }
    }

    // Check expiry
    if (Date.now() > storedData.expiresAt) {
      this.otpStore.delete(otpKey)
      return {
        success: false,
        message: 'Verification code has expired. Please request a new one.'
      }
    }

    // Check attempts
    if (storedData.attempts >= 3) {
      this.otpStore.delete(otpKey)
      return {
        success: false,
        message: 'Too many failed attempts. Please request a new code.'
      }
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts++
      return {
        success: false,
        message: 'Invalid verification code. Please try again.'
      }
    }

    // Success - remove OTP
    this.otpStore.delete(otpKey)
    return {
      success: true,
      message: 'Verification successful'
    }
  }

  // Verify backup code
  async verifyBackupCode(admin, code) {
    if (!admin.mfa.backupCodes || !admin.mfa.backupCodes.includes(code)) {
      return {
        success: false,
        message: 'Invalid backup code'
      }
    }

    // Remove used backup code
    admin.mfa.backupCodes = admin.mfa.backupCodes.filter(c => c !== code)
    await admin.save()

    return {
      success: true,
      message: 'Backup code verified successfully'
    }
  }

  // Enable MFA for user
  async enableMFA(admin) {
    try {
      const backupCodes = this.generateBackupCodes()
      
      admin.mfa = {
        isEnabled: true,
        backupCodes,
        lastUsed: new Date()
      }
      
      await admin.save()

      return {
        success: true,
        backupCodes,
        message: 'MFA enabled successfully'
      }
    } catch (error) {
      throw new Error('Failed to enable MFA')
    }
  }

  // Disable MFA for user
  async disableMFA(admin) {
    try {
      admin.mfa = {
        isEnabled: false,
        backupCodes: [],
        lastUsed: null
      }
      
      await admin.save()

      return {
        success: true,
        message: 'MFA disabled successfully'
      }
    } catch (error) {
      throw new Error('Failed to disable MFA')
    }
  }

  // Clean expired OTPs (call periodically)
  cleanExpiredOTPs() {
    const now = Date.now()
    for (const [key, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        this.otpStore.delete(key)
      }
    }
  }
}

module.exports = new MFAService()