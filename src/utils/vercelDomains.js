// Auto-provision tenant subdomains on Vercel.
//
// When a new tenant signs up, the DB row gets created but the subdomain
// (e.g. ram.laundrylobby.com) doesn't actually serve traffic until Vercel
// is told "this domain is mine and I want a cert for it". This module
// makes that call. Vercel performs HTTP-01 ACME validation against the
// existing wildcard A record at the registrar, then issues a Let's Encrypt
// cert in ~30-60 seconds. No DNS changes are needed at the registrar.
//
// Required env (backend `.env`):
//   VERCEL_TOKEN       — token from https://vercel.com/account/tokens
//   VERCEL_PROJECT_ID  — frontend project ID (prj_...)
//   VERCEL_TEAM_ID     — owning team ID (team_...) — optional for personal accounts
//   ROOT_DOMAIN        — e.g. laundrylobby.com (default below)
//
// If any required env is missing, calls are no-ops (logged) so missing
// config never blocks tenant activation; the subdomain just won't serve
// over HTTPS until configured + a backfill is run.

const axios = require('axios');

const VERCEL_API = 'https://api.vercel.com';
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'laundrylobby.com';

function isValidSlug(slug) {
  // Subdomain label rules: letters, digits, hyphens (no leading/trailing -),
  // 1-63 chars. Defensive — backend already validates at signup, but a bad
  // slug here would yield a 400 from Vercel which is annoying to debug.
  return typeof slug === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

function getConfig() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId) {
    return { ok: false, reason: 'missing-env' };
  }
  return { ok: true, token, projectId, teamId };
}

function teamSuffix(teamId) {
  return teamId ? `?teamId=${teamId}` : '';
}

/**
 * Register `<slug>.${ROOT_DOMAIN}` on the Vercel project so it serves
 * traffic + gets an SSL cert. Idempotent — calling twice is fine.
 *
 * Never throws. Returns a result object so the caller can log/track but
 * not fail tenant activation if Vercel is having a moment.
 */
async function addTenantDomain(slug) {
  if (!isValidSlug(slug)) {
    return { success: false, reason: 'invalid-slug', slug };
  }

  const cfg = getConfig();
  if (!cfg.ok) {
    console.warn(`[vercelDomains] skip ${slug} — ${cfg.reason}`);
    return { success: false, reason: cfg.reason };
  }

  const domain = `${slug}.${ROOT_DOMAIN}`;
  const url = `${VERCEL_API}/v10/projects/${cfg.projectId}/domains${teamSuffix(cfg.teamId)}`;

  try {
    const response = await axios.post(
      url,
      { name: domain },
      {
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        timeout: 10_000,
      }
    );
    console.log(`[vercelDomains] ✅ Registered ${domain}; cert provisioning started`);
    return { success: true, domain, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    // 409 = domain already on this project (idempotent — that's fine)
    if (status === 409) {
      console.log(`[vercelDomains] ℹ️ ${domain} already registered`);
      return { success: true, domain, alreadyExists: true };
    }
    // 403 = domain owned by another project/account (real conflict)
    // 400 = bad request (invalid name, etc.)
    // 5xx = Vercel transient — retry layer will handle if needed
    const errorBody = err.response?.data || err.message;
    console.error(`[vercelDomains] ❌ Failed to register ${domain} (status ${status}):`, errorBody);
    return { success: false, status, error: errorBody, domain };
  }
}

/**
 * Remove `<slug>.${ROOT_DOMAIN}` from the Vercel project. Use when a
 * tenant cancels / is hard-deleted. Idempotent — 404 is treated as success.
 */
async function removeTenantDomain(slug) {
  if (!isValidSlug(slug)) {
    return { success: false, reason: 'invalid-slug', slug };
  }

  const cfg = getConfig();
  if (!cfg.ok) {
    console.warn(`[vercelDomains] skip remove ${slug} — ${cfg.reason}`);
    return { success: false, reason: cfg.reason };
  }

  const domain = `${slug}.${ROOT_DOMAIN}`;
  const url = `${VERCEL_API}/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}${teamSuffix(cfg.teamId)}`;

  try {
    await axios.delete(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 10_000,
    });
    console.log(`[vercelDomains] 🗑️ Removed ${domain}`);
    return { success: true, domain };
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      // Already gone — fine
      return { success: true, domain, notFound: true };
    }
    const errorBody = err.response?.data || err.message;
    console.error(`[vercelDomains] ❌ Failed to remove ${domain} (status ${status}):`, errorBody);
    return { success: false, status, error: errorBody, domain };
  }
}

module.exports = { addTenantDomain, removeTenantDomain };
