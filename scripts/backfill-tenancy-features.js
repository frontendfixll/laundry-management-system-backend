/**
 * Backfill tenancy features so the sidebar gates render correctly.
 *
 * Walks every Tenancy and applies the canonical alias map from
 * utils/featureAliases. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-tenancy-features.js          # apply
 *   node scripts/backfill-tenancy-features.js --dry-run  # preview only
 *   node scripts/backfill-tenancy-features.js --slug=<slug>   # one tenant
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenancy = require('../src/models/Tenancy');
const { normalizeFeatures } = require('../src/utils/featureAliases');

const dryRun = process.argv.includes('--dry-run');
const slugArg = process.argv.find(a => a.startsWith('--slug='));
const onlySlug = slugArg ? slugArg.split('=')[1] : null;

function shallowDiffKeys(before, after) {
  const added = [];
  for (const k of Object.keys(after || {})) {
    if (before?.[k] === undefined) added.push(k);
  }
  return added;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[backfill] connected. dryRun=${dryRun} onlySlug=${onlySlug || 'all'}`);

  const filter = onlySlug ? { slug: onlySlug } : {};
  const tenancies = await Tenancy.find(filter);
  console.log(`[backfill] scanning ${tenancies.length} tenancies`);

  let touched = 0;
  let skipped = 0;

  for (const t of tenancies) {
    const before = t.subscription?.features
      ? (t.subscription.features instanceof Map
          ? Object.fromEntries(t.subscription.features)
          : { ...t.subscription.features })
      : {};

    const after = normalizeFeatures(before);
    const added = shallowDiffKeys(before, after);

    if (added.length === 0) {
      skipped++;
      continue;
    }

    touched++;
    console.log(`  + ${t.slug.padEnd(28)} plan=${(t.subscription?.plan || '?').padEnd(12)} adds: ${added.join(', ')}`);

    if (!dryRun) {
      t.subscription.features = after;
      t.markModified('subscription.features');
      await t.save();
    }
  }

  console.log(`[backfill] done. touched=${touched} skipped=${skipped} ${dryRun ? '(dry-run, no writes)' : ''}`);
  await mongoose.disconnect();
})().catch(err => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
