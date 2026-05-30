// One-time backfill: populate Branch.location (GeoJSON Point) from existing
// coordinates.latitude/longitude or address.coordinates.lat/lng so $geoNear
// queries from the customer marketplace app work for all existing branches.
//
// Safe to re-run — only updates branches whose location field is missing/empty.
//
// Usage:
//   node scripts/backfill-branch-geojson.js
//   node scripts/backfill-branch-geojson.js --dry-run     # report only
//   node scripts/backfill-branch-geojson.js --tenancy=<id> # one tenant only

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Branch = require('../src/models/Branch');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenancyFilter = args.find(a => a.startsWith('--tenancy='))?.split('=')[1];

(async function main() {
  console.log(`[backfill-geo] starting — ${dryRun ? 'DRY RUN' : 'LIVE'}${tenancyFilter ? `, tenancy=${tenancyFilter}` : ''}`);

  await connectDB();

  const query = {
    $or: [
      { location: { $exists: false } },
      { 'location.coordinates': { $size: 0 } },
      { 'location.coordinates': { $exists: false } }
    ]
  };
  if (tenancyFilter) query.tenancy = new mongoose.Types.ObjectId(tenancyFilter);

  const branches = await Branch.find(query).select('name code coordinates address location tenancy').lean();
  console.log(`[backfill-geo] found ${branches.length} branch(es) needing GeoJSON backfill`);

  let updated = 0;
  let skipped = 0;
  const skippedDetails = [];

  for (const b of branches) {
    const lat = b.coordinates?.latitude ?? b.address?.coordinates?.lat;
    const lng = b.coordinates?.longitude ?? b.address?.coordinates?.lng;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      skipped++;
      skippedDetails.push({ id: b._id.toString(), code: b.code, name: b.name, reason: 'no lat/lng — run geocode script next' });
      continue;
    }

    if (dryRun) {
      console.log(`[backfill-geo] would update ${b.code} → [${lng}, ${lat}]`);
      updated++;
      continue;
    }

    await Branch.updateOne(
      { _id: b._id },
      { $set: { location: { type: 'Point', coordinates: [lng, lat] } } }
    );
    updated++;
    console.log(`[backfill-geo] ✅ ${b.code} (${b.name}) → [${lng}, ${lat}]`);
  }

  console.log(`\n[backfill-geo] done — updated: ${updated}, skipped: ${skipped}`);
  if (skippedDetails.length) {
    console.log('\n[backfill-geo] skipped branches (need geocoding):');
    skippedDetails.forEach(s => console.log(`  - ${s.code} (${s.name}) [${s.id}]`));
    console.log('\n  → Run: node scripts/geocode-branches.js');
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('[backfill-geo] ❌ fatal:', err);
  process.exit(1);
});
