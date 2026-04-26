// Cookie configuration for authentication.
//
// `sameSite: 'lax'` (was 'strict') so the cookie still flows on top-level GET
// navigations from another origin (login redirects, password-reset links).
// 'strict' blocked these and forced fallback to localStorage Bearer auth,
// which is XSS-readable and undermined the HttpOnly protection.
//
// `domain` is opt-in via env: set `COOKIE_DOMAIN=.laundrylobby.com` in
// production once the API moves to api.laundrylobby.com so the cookie is
// shared across `*.laundrylobby.com` (tenant subdomains + superadmin + tenacy).
// Until then keep it unset — a `Domain=...` cookie set by `*.vercel.app`
// would simply be rejected by browsers.

const isProduction = process.env.NODE_ENV === 'production'
const cookieDomain = process.env.COOKIE_DOMAIN || undefined

const baseCookieOptions = {
  httpOnly: true,           // Not accessible via JavaScript (XSS defense)
  secure: isProduction,     // HTTPS only in production
  sameSite: 'lax',          // Permits top-level GET cross-site navigation
  path: '/',
  ...(cookieDomain ? { domain: cookieDomain } : {}),
}

const cookieConfig = {
  // Access token cookie options
  accessToken: {
    ...baseCookieOptions,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Refresh token cookie options (if needed later)
  refreshToken: {
    ...baseCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

// Clear auth cookie. `clearCookie` only matches cookies set with the same
// (path, domain, secure, sameSite) tuple, so we mirror the options used at
// `setAuthCookie` time — otherwise the browser keeps the original cookie.
const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, baseCookieOptions)
}

// Clear superadmin auth cookie
const clearSuperAdminAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAMES.SUPERADMIN_TOKEN, baseCookieOptions)
}

// Get token from cookie or header (for backward compatibility)
// Checks: Authorization header first (explicit), then laundry_access_token, then laundry_superadmin_token
const getTokenFromRequest = (req) => {
  // Authorization header first (what frontend API client sends)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1]
  }

  // User/tenant access token cookie
  if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
    return req.cookies[COOKIE_NAMES.ACCESS_TOKEN]
  }

  // SuperAdmin token cookie (for support portal when cookie is sent)
  if (req.cookies && req.cookies[COOKIE_NAMES.SUPERADMIN_TOKEN]) {
    return req.cookies[COOKIE_NAMES.SUPERADMIN_TOKEN]
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
