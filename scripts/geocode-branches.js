// Geocode branches that have no lat/lng using OpenStreetMap Nominatim (free, no API key).
// Nominatim usage policy: max 1 request/second, must set a User-Agent.
// https://operations.osmfoundation.org/policies/nominatim/
//
// Writes back to:
//   - coordinates.latitude / coordinates.longitude   (existing source of truth)
//   - address.coordinates.lat / .lng                  (existing nested field)
//   - location: { type: 'Point', coordinates: [lng, lat] }  (new GeoJSON)
//
// Usage:
//   node scripts/geocode-branches.js
//   node scripts/geocode-branches.js --dry-run
//   node scripts/geocode-branches.js --limit=10
//   node scripts/geocode-branches.js --tenancy=<id>

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const connectDB = require('../src/config/database');
const Branch = require('../src/models/Branch');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? parseInt(limitArg, 10) : null;
const tenancyFilter = args.find(a => a.startsWith('--tenancy='))?.split('=')[1];

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'LaundryLobby-Marketplace-Backfill/1.0 (contact: be@fixlsolutions.com)';
const RATE_LIMIT_MS = 1100; // 1.1s between requests, safely under 1 req/sec policy

const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildQueryString(address) {
  const parts = [
    address?.addressLine1,
    address?.addressLine2,
    address?.landmark,
    address?.city,
    address?.state,
    address?.pincode,
    'India'
  ].filter(Boolean);
  return parts.join(', ');
}

async function geocode(query) {
  const res = await axios.get(NOMINATIM_URL, {
    params: { format: 'json', limit: 1, countrycodes: 'in', q: query },
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000
  });
  const data = res.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name
  };
}

(async function main() {
  console.log(`[geocode] starting — ${dryRun ? 'DRY RUN' : 'LIVE'}${limit ? `, limit=${limit}` : ''}${tenancyFilter ? `, tenancy=${tenancyFilter}` : ''}`);
  console.log(`[geocode] using Nominatim @ 1 req/sec — be patient with large datasets`);

  await connectDB();

  const query = {
    $and: [
      {
        $or: [
          { 'coordinates.latitude': { $exists: false } },
          { 'coordinates.latitude': null },
          { 'coordinates.longitude': { $exists: false } },
          { 'coordinates.longitude': null }
        ]
      },
      { 'address.addressLine1': { $exists: true, $ne: '' } }
    ]
  };
  if (tenancyFilter) query.tenancy = new mongoose.Types.ObjectId(tenancyFilter);

  let cursor = Branch.find(query).select('name code address tenancy');
  if (limit) cursor = cursor.limit(limit);
  const branches = await cursor.lean();

  console.log(`[geocode] found ${branches.length} branch(es) to geocode`);

  let success = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const queryStr = buildQueryString(b.address);

    if (!queryStr || queryStr.length < 5) {
      failed++;
      failures.push({ code: b.code, name: b.name, reason: 'address too sparse' });
      continue;
    }

    process.stdout.write(`[geocode] (${i + 1}/${branches.length}) ${b.code} — querying... `);

    try {
      const result = await geocode(queryStr);

      if (!result) {
        console.log('❌ not found');
        failed++;
        failures.push({ code: b.code, name: b.name, reason: 'not found in Nominatim', query: queryStr });
      } else {
        console.log(`✅ [${result.lng}, ${result.lat}]`);
        if (!dryRun) {
          await Branch.updateOne(
            { _id: b._id },
            {
              $set: {
                'coordinates.latitude': result.lat,
                'coordinates.longitude': result.lng,
                'address.coordinates.lat': result.lat,
                'address.coordinates.lng': result.lng,
                location: { type: 'Point', coordinates: [result.lng, result.lat] }
              }
            }
          );
        }
        success++;
      }
    } catch (err) {
      console.log(`💥 ${err.message}`);
      failed++;
      failures.push({ code: b.code, name: b.name, reason: err.message });
    }

    // Rate limit — Nominatim allows max 1 req/sec
    if (i < branches.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n[geocode] done — success: ${success}, failed: ${failed}`);
  if (failures.length) {
    console.log('\n[geocode] failures (manual review needed):');
    failures.forEach(f => console.log(`  - ${f.code} (${f.name}): ${f.reason}${f.query ? ` | query: "${f.query}"` : ''}`));
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('[geocode] ❌ fatal:', err);
  process.exit(1);
});
