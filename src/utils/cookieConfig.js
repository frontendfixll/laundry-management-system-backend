// Cookie configuration for authentication

const isProduction = process.env.NODE_ENV === 'production'

const cookieConfig = {
  // Access token cookie options
  accessToken: {
    httpOnly: true,           // Not accessible via JavaScript
    secure: isProduction,     // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax',  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours
    path: '/'
  },
  
  // Refresh token cookie options (if needed later)
  refreshToken: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    path: '/'
  }
}

// Cookie names
const COOKIE_NAMES = {
  ACCESS_TOKEN: 'laundry_access_token',
  REFRESH_TOKEN: 'laundry_refresh_token',
  SUPERADMIN_TOKEN: 'laundry_superadmin_token'
}

// Set auth cookie
const setAuthCookie = (res, token) => {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, token, cookieConfig.accessToken)
}

// Set superadmin auth cookie
const setSuperAdminAuthCookie = (res, token, customMaxAge) => {
  const options = { ...cookieConfig.accessToken }
  
  // If customMaxAge is provided, use it; if undefined (session), don't set maxAge
  if (customMaxAge !== undefined) {
    options.maxAge = customMaxAge
  } else {
    // Session cookie - remove maxAge so it expires when browser closes
    delete options.maxAge
  }
  
  res.cookie(COOKIE_NAMES.SUPERADMIN_TOKEN, token, options)
}

// Clear auth cookie
const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/'
  })
}

// Clear superadmin auth cookie
const clearSuperAdminAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAMES.SUPERADMIN_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/'
  })
}

// Get token from cookie or header (for backward compatibility)
const getTokenFromRequest = (req) => {
  // First check cookie
  if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
    return req.cookies[COOKIE_NAMES.ACCESS_TOKEN]
  }
  
  // Fallback to Authorization header (for mobile apps or API clients)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1]
  }
  
  return null
}

// Get superadmin token from cookie or header
const getSuperAdminTokenFromRequest = (req) => {
  // First check superadmin cookie
  if (req.cookies && req.cookies[COOKIE_NAMES.SUPERADMIN_TOKEN]) {
    return req.cookies[COOKIE_NAMES.SUPERADMIN_TOKEN]
  }
  
  // Fallback to Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1]
  }
  
  return null
}

module.exports = {
  cookieConfig,
  COOKIE_NAMES,
  setAuthCookie,
  setSuperAdminAuthCookie,
  clearAuthCookie,
  clearSuperAdminAuthCookie,
  getTokenFromRequest,
  getSuperAdminTokenFromRequest
}
