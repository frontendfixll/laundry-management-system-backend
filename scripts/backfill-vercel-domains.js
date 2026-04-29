// One-time backfill: register every existing active tenant's subdomain
// on Vercel so they all get HTTPS. Safe to re-run — addTenantDomain is
// idempotent (409 "already exists" is treated as success).
//
// Usage:
//   node scripts/backfill-vercel-domains.js
//   node scripts/backfill-vercel-domains.js --dry-run     # list, don't call API
//   node scripts/backfill-vercel-domains.js --slug=ram    # only one tenant

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Tenancy = require('../src/models/Tenancy');
const { addTenantDomain } = require('../src/utils/vercelDomains');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1];

(async function main() {
  console.log(`[backfill] starting — ${dryRun ? 'DRY RUN' : 'LIVE'}${slugFilter ? `, slug=${slugFilter}` : ''}`);

  // Sanity-check env upfront so we don't grind through a list and silently
  // no-op every call.
  const missing = ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID']
    .filter(k => !process.env[k]);
  if (missing.length && !dryRun) {
    console.error(`[backfill] ❌ Missing env: ${missing.join(', ')} — aborting.`);
    console.error(`[backfill]    Add them to .env, or pass --dry-run to preview without API calls.`);
    process.exit(1);
  }

  await connectDB();

  const query = { status: 'active', isDeleted: { $ne: true } };
  if (slugFilter) query.slug = slugFilter;

  const tenancies = await Tenancy.find(query).select('slug subdomain name').lean();
  console.log(`[backfill] found ${tenancies.length} tenant(s) to register`);

  if (tenancies.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const results = { ok: 0, alreadyExists: 0, failed: 0, skipped: 0 };

  for (const t of tenancies) {
    const slug = t.subdomain || t.slug;
    if (!slug) {
      console.log(`[backfill] ⊘ skip ${t.name} (${t._id}) — no slug/subdomain`);
      results.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[backfill] would register ${slug}.laundrylobby.com (${t.name})`);
      results.ok++;
      continue;
    }

    const r = await addTenantDomain(slug);
    if (r.success) {
      results.ok++;
      if (r.alreadyExists) results.alreadyExists++;
    } else {
      results.failed++;
      console.error(`[backfill] ❌ ${slug}: ${JSON.stringify(r.error || r.reason)}`);
    }

    // Small delay between calls — Vercel API is rate-limited but generous.
    // 200 ms keeps us well under any practical limit even for thousands of
    // tenants in one run.
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`[backfill] done — ok=${results.ok} (already=${results.alreadyExists}) failed=${results.failed} skipped=${results.skipped}`);
  await mongoose.disconnect();
})().catch(err => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
