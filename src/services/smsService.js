// SMS sender wrapper for the customer-app OTP flow.
//
// Providers:
//   - 'fast2sms' (default if FAST2SMS_API_KEY is set)
//   - 'console'  (dev fallback — prints OTP to logs, no real SMS)
//
// Selection rules:
//   - If SMS_PROVIDER env var is set, use it explicitly
//   - Else if FAST2SMS_API_KEY is set, use Fast2SMS
//   - Else fall back to console (dev mode — never silently fails in prod
//     because the controller refuses to send when NODE_ENV=production and
//     no real provider is configured)

const axios = require('axios');

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

function pickProvider() {
  if (process.env.SMS_PROVIDER) return process.env.SMS_PROVIDER.toLowerCase();
  if (process.env.FAST2SMS_API_KEY) return 'fast2sms';
  return 'console';
}

/**
 * Send an OTP SMS.
 * @param {{ phone: string, code: string }} args
 * @returns {Promise<{ provider: string, success: boolean, info?: any, error?: string }>}
 */
async function sendOtpSms({ phone, code }) {
  const provider = pickProvider();

  if (provider === 'console') {
    if (process.env.NODE_ENV === 'production') {
      return {
        provider,
        success: false,
        error: 'No SMS provider configured in production (set FAST2SMS_API_KEY or SMS_PROVIDER)'
      };
    }
    console.log(`📱 [DEV SMS] OTP for ${phone}: ${code}`);
    return { provider: 'console', success: true };
  }

  if (provider === 'fast2sms') {
    try {
      // Fast2SMS "OTP" route: simple OTP message, works without DLT template
      // approval for development. For production scale, switch to the DLT route
      // (route=dlt) with an approved sender ID + template.
      const res = await axios.post(
        FAST2SMS_URL,
        {
          variables_values: code,
          route: 'otp',
          numbers: phone
        },
        {
          headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      );

      if (res.data?.return === true) {
        return { provider, success: true, info: res.data };
      }
      return { provider, success: false, error: res.data?.message || 'fast2sms returned non-success' };
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error('[sms] fast2sms error:', detail);
      return { provider, success: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    }
  }

  return { provider, success: false, error: `Unknown SMS provider: ${provider}` };
}

module.exports = { sendOtpSms };
