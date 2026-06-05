/**
 * Plan-feature naming drift: many BillingPlans store sidebar gates under
 * `_management`-suffixed keys (legacy convention) while the frontend's
 * useFeatures hook checks bare keys (canonical convention). This utility
 * translates legacy → canonical when both could mean the same thing.
 *
 * Also fills in canonical sidebar keys that legacy plans don't include at
 * all (orders, tickets, reviews, refunds, settings, payments) when there's
 * a positive signal that this is a real, paid-ish plan — so tenants don't
 * end up with a half-empty sidebar after signup.
 */

const ALIAS_MAP = {
  customer_management: 'customers',
  branch_management: 'branches',
  branch_admin_rbac: 'branch_admins',
  inventory_management: 'inventory',
  service_management: 'services',
  logistics_management: 'logistics',
  payment_management: 'payments',
};

// Sidebar gates the frontend checks; if a tenancy has ANY positive signal
// (the keys below), these get backfilled to true when missing — the plan
// is clearly meant to grant a working tenant UI.
const CORE_SIDEBAR_KEYS = [
  'orders',
  'tickets',
  'reviews',
  'refunds',
  'settings',
];

// Signals that a plan is intended to grant tenant-management capabilities.
// If any of these are truthy, the plan is "real" and we backfill core keys.
const REAL_PLAN_SIGNALS = [
  ...Object.keys(ALIAS_MAP),                 // legacy management keys
  ...Object.values(ALIAS_MAP),               // canonical equivalents
  'orders', 'customers', 'branches', 'branch_admins',
];

/**
 * Returns a NEW features object with legacy aliases expanded to canonical
 * keys (without removing the legacy entries — backward-compatible) and core
 * sidebar keys backfilled when there's a positive signal.
 *
 * Idempotent: running multiple times yields the same result.
 */
function normalizeFeatures(input) {
  if (!input || typeof input !== 'object') return input;

  const features = { ...input };

  // 1. Expand legacy aliases onto canonical keys.
  for (const [legacy, canonical] of Object.entries(ALIAS_MAP)) {
    if (features[legacy] !== undefined && features[canonical] === undefined) {
      features[canonical] = features[legacy];
    }
  }

  // 2. If the plan has any signal of being a real plan, backfill core sidebar
  //    keys that the frontend expects but plans don't always set.
  const isRealPlan = REAL_PLAN_SIGNALS.some(key => features[key] === true);
  if (isRealPlan) {
    for (const key of CORE_SIDEBAR_KEYS) {
      if (features[key] === undefined) features[key] = true;
    }
  }

  return features;
}

module.exports = { normalizeFeatures, ALIAS_MAP, CORE_SIDEBAR_KEYS };
