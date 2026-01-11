const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (payload, expiresIn = process.env.JWT_EXPIRE || '24h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Generate email verification token
const generateEmailVerificationToken = (userId, email) => {
  return generateToken(
    { 
      userId, 
      email, 
      type: 'email_verification' 
    }, 
    '24h' // Email verification tokens expire in 24 hours
  );
};

// Generate password reset token
const generatePasswordResetToken = (userId, email) => {
  return generateToken(
    { 
      userId, 
      email, 
      type: 'password_reset' 
    }, 
    '1h' // Password reset tokens expire in 1 hour
  );
};

// Verify email verification token
const verifyEmailVerificationToken = (token) => {
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'email_verification') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired email verification token');
  }
};

// Verify password reset token
const verifyPasswordResetToken = (token) => {
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'password_reset') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired password reset token');
  }
};

// Generate access token for authentication
// For admin/branch_admin users, includes assignedBranch and tenancy in token
const generateAccessToken = (userId, email, role = 'customer', assignedBranch = null, tenancyId = null) => {
  const payload = { 
    userId, 
    email, 
    role,
    type: 'access_token' 
  };
  
  // Include assignedBranch for admin and branch_admin users
  if ((role === 'admin' || role === 'branch_admin') && assignedBranch) {
    payload.assignedBranch = assignedBranch;
  }
  
  // Include tenancy for multi-tenant support
  if (tenancyId) {
    payload.tenancyId = tenancyId;
  }
  
  return generateToken(payload, process.env.JWT_EXPIRE || '7d');
};

// Verify access token
const verifyAccessToken = (token) => {
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'access_token') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

module.exports = {
  generateToken,
  verifyToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyEmailVerificationToken,
  verifyPasswordResetToken,
  generateAccessToken,
  verifyAccessToken
};