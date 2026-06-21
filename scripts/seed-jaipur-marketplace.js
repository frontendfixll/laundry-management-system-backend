// Seed a realistic Jaipur marketplace dataset for customer-app testing.
//
// Adds (idempotently, by branch code / serviceItem itemId) under an existing
// tenant:
//   - 6 branches across recognizable Jaipur neighborhoods with real lat/lng
//   - Up to ~30 ServiceItems with image URLs (Unsplash)
//   - Each branch enabled for marketplace + has hero images
//   - Each branch has BranchService rows for the 4 main services
//
// Re-runs are safe — existing branches/items are skipped, only missing rows
// get created.
//
// Usage:
//   node scripts/seed-jaipur-marketplace.js
//   node scripts/seed-jaipur-marketplace.js --tenant=<tenancyId>
//   node scripts/seed-jaipur-marketplace.js --tenant-slug=laundry
//   node scripts/seed-jaipur-marketplace.js --dry-run

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Tenancy = require('../src/models/Tenancy');
const Branch = require('../src/models/Branch');
const Service = require('../src/models/Service');
const ServiceItem = require('../src/models/ServiceItem');
const BranchService = require('../src/models/BranchService');
const CenterAdmin = require('../src/models/CenterAdmin');
const User = require('../src/models/User');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenantIdArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1];
const tenantSlugArg = args.find(a => a.startsWith('--tenant-slug='))?.split('=')[1];

// ============================================
// Branch seed data — 6 real Jaipur neighborhoods
// ============================================
const BRANCHES = [
  {
    code: 'JP-VAISH-01',
    name: 'LaundryLobby Vaishali Nagar',
    coordinates: { latitude: 26.9124, longitude: 75.7430 },
    address: {
      addressLine1: 'Plot 12, Amrapali Marg',
      city: 'Jaipur', state: 'Rajasthan', pincode: '302021',
      landmark: 'Near Vaishali Circle'
    },
    contact: { phone: '9001100001', whatsapp: '9001100001' },
    images: [
      { url: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=800', alt: 'Modern laundry storefront', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?w=800', alt: 'Folded clean clothes' }
    ]
  },
  {
    code: 'JP-MALV-02',
    name: 'LaundryLobby Malviya Nagar',
    coordinates: { latitude: 26.8519, longitude: 75.8146 },
    address: {
      addressLine1: 'Shop 4, Sector 6 Market',
      city: 'Jaipur', state: 'Rajasthan', pincode: '302017',
      landmark: 'Opposite Big Bazaar'
    },
    contact: { phone: '9001100002', whatsapp: '9001100002' },
    images: [
      { url: 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=800', alt: 'Premium laundry interior', isPrimary: true }
    ]
  },
  {
    code: 'JP-CSCH-03',
    name: 'LaundryLobby C-Scheme',
    coordinates: { latitude: 26.9072, longitude: 75.8016 },
    address: {
      addressLine1: '7, Ashok Marg',
      city: 'Jaipur', state: 'Rajasthan', pincode: '302001',
      landmark: 'Near Statue Circle'
    },
    contact: { phone: '9001100003' },
    images: [
      { url: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=800', alt: 'Washing machines row', isPrimary: true },
      { url: 'https://images.unsplash.com/photo-1604335078635-7d167a3b3055?w=800', alt: 'Ironed shirts on hangers' }
    ]
  },
  {
    code: 'JP-MANS-04',
    name: 'LaundryLobby Mansarovar',
    coordinates: { latitude: 26.8503, longitude: 75.7595 },
    address: {
      addressLine1: 'F-21, Madhyam Marg',
      city: 'Jaipur', state: 'Rajasthan', pincode: '302020',
      landmark: 'Near Apex Mall'
    },
    contact: { phone: '9001100004', whatsapp: '9001100004' },
    images: [
      { url: 'https://images.unsplash.com/photo-1521656693074-0ef32e80a5d5?w=800', alt: 'Clean shirts hanging', isPrimary: true }
    ]
  },
  {
    code: 'JP-RAJA-05',
    name: 'LaundryLobby Raja Park',
    coordinates: { latitude: 26.9015, longitude: 75.8329 },
    address: {
      addressLine1: '14, Yudhishtir Marg',
      city: 'Jaipur', state: 'Rajasthan', pincode: '302004',
      landmark: 'Near Adarsh Nagar metro'
    },
    contact: { phone: '9001100005' },
    images: [
      { url: 'https://images.unsplash.com/photo-1469504512102-900f29606341?w=800', alt: 'Laundry baskets', isPrimary: true }
    ]
  },
  {
    code: 'JP-JAGAT-06',
    name: 'LaundryLobby Jagatpura',
    coordinates: { latitude: 26.8333, longitude: 75.8500 },
    address: {
      addressLine1: 'B-18, Jagatpura Main Road',
      city: 'Jaipur', state: 'Rajasthan', pincode: '302017',
      landmark: 'Near Vivekanand Marg'
    },
    contact: { phone: '9001100006', whatsapp: '9001100006' },
    images: [
      { url: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=800', alt: 'Linen and towels', isPrimary: true }
    ]
  }
];

// ============================================
// Service definitions (parent Service records) — created if missing per tenant
// ============================================
const SERVICES = [
  { code: 'wash_fold',    displayName: 'Wash & Fold',    category: 'laundry',      icon: 'Shirt',  turnaround: { standard: 48, express: 24 } },
  { code: 'dry_clean',    displayName: 'Dry Clean',      category: 'dry_cleaning', icon: 'Sparkles', turnaround: { standard: 72, express: 36 } },
  { code: 'steam_press',  displayName: 'Steam Iron',     category: 'pressing',     icon: 'Wind',   turnaround: { standard: 24, express: 12 } },
  { code: 'premium',      displayName: 'Premium Care',   category: 'specialty',    icon: 'Star',   turnaround: { standard: 96, express: 48 } }
];

// ============================================
// ServiceItems (the orderable units) — created if itemId missing
// Image URLs are tiny Unsplash thumbs (~100x100 is plenty for a cart row).
// ============================================
const ITEMS = [
  // Wash & Fold
  { itemId: 'wf-shirt',    name: 'Shirt',        service: 'wash_fold',   category: 'men',   basePrice: 35, imageUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=200' },
  { itemId: 'wf-tshirt',   name: 'T-Shirt',      service: 'wash_fold',   category: 'men',   basePrice: 30, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200' },
  { itemId: 'wf-trouser',  name: 'Trouser',      service: 'wash_fold',   category: 'men',   basePrice: 40, imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=200' },
  { itemId: 'wf-jeans',    name: 'Jeans',        service: 'wash_fold',   category: 'men',   basePrice: 50, imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=200' },
  { itemId: 'wf-kurti',    name: 'Kurti',        service: 'wash_fold',   category: 'women', basePrice: 45, imageUrl: 'https://images.unsplash.com/photo-1583391733956-6c78c5b7f80b?w=200' },
  { itemId: 'wf-dress',    name: 'Dress',        service: 'wash_fold',   category: 'women', basePrice: 60, imageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200' },
  { itemId: 'wf-bedsheet', name: 'Bed Sheet',    service: 'wash_fold',   category: 'household', basePrice: 80, imageUrl: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=200' },
  { itemId: 'wf-towel',    name: 'Towel',        service: 'wash_fold',   category: 'household', basePrice: 25, imageUrl: 'https://images.unsplash.com/photo-1620912189865-0c4b9d2e84c8?w=200' },

  // Dry Clean
  { itemId: 'dc-suit-2pc', name: 'Suit (2-piece)', service: 'dry_clean', category: 'men',   basePrice: 280, imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=200' },
  { itemId: 'dc-suit-3pc', name: 'Suit (3-piece)', service: 'dry_clean', category: 'men',   basePrice: 380, imageUrl: 'https://images.unsplash.com/photo-1593032465175-481ac7f401a0?w=200' },
  { itemId: 'dc-blazer',   name: 'Blazer',         service: 'dry_clean', category: 'men',   basePrice: 220, imageUrl: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200' },
  { itemId: 'dc-jacket',   name: 'Jacket',         service: 'dry_clean', category: 'men',   basePrice: 200, imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200' },
  { itemId: 'dc-kurta',    name: 'Kurta',          service: 'dry_clean', category: 'men',   basePrice: 120, imageUrl: 'https://images.unsplash.com/photo-1622445275576-721325763afe?w=200' },
  { itemId: 'dc-sherwani', name: 'Sherwani',       service: 'dry_clean', category: 'men',   basePrice: 450, imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=200' },
  { itemId: 'dc-saree',    name: 'Saree',          service: 'dry_clean', category: 'women', basePrice: 200, imageUrl: 'https://images.unsplash.com/photo-1610030469668-8e4a7eaab8c8?w=200' },
  { itemId: 'dc-saree-silk', name: 'Silk Saree',   service: 'dry_clean', category: 'women', basePrice: 300, imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=200' },
  { itemId: 'dc-lehenga',  name: 'Lehenga',        service: 'dry_clean', category: 'women', basePrice: 500, imageUrl: 'https://images.unsplash.com/photo-1583391099961-d2898ee18d24?w=200' },
  { itemId: 'dc-gown',     name: 'Gown',           service: 'dry_clean', category: 'women', basePrice: 350, imageUrl: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=200' },
  { itemId: 'dc-curtain',  name: 'Curtain (per panel)', service: 'dry_clean', category: 'household', basePrice: 180, imageUrl: 'https://images.unsplash.com/photo-1631049035326-57414e7739b1?w=200' },

  // Steam Iron
  { itemId: 'si-shirt',    name: 'Shirt',        service: 'steam_press', category: 'men',   basePrice: 15, imageUrl: 'https://images.unsplash.com/photo-1604335079253-83b0fb04b6a4?w=200' },
  { itemId: 'si-tshirt',   name: 'T-Shirt',      service: 'steam_press', category: 'men',   basePrice: 12, imageUrl: 'https://images.unsplash.com/photo-1622519524125-1ce3a8e3c08e?w=200' },
  { itemId: 'si-trouser',  name: 'Trouser',      service: 'steam_press', category: 'men',   basePrice: 18, imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=200' },
  { itemId: 'si-kurta',    name: 'Kurta',        service: 'steam_press', category: 'men',   basePrice: 20, imageUrl: 'https://images.unsplash.com/photo-1622445275576-721325763afe?w=200' },
  { itemId: 'si-kurti',    name: 'Kurti',        service: 'steam_press', category: 'women', basePrice: 20, imageUrl: 'https://images.unsplash.com/photo-1583391733956-6c78c5b7f80b?w=200' },
  { itemId: 'si-dupatta',  name: 'Dupatta',      service: 'steam_press', category: 'women', basePrice: 25, imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=200' },

  // Premium Care
  { itemId: 'pr-leather',  name: 'Leather Jacket', service: 'premium', category: 'men',   basePrice: 800, imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200' },
  { itemId: 'pr-wedding',  name: 'Wedding Dress',  service: 'premium', category: 'women', basePrice: 1500, imageUrl: 'https://images.unsplash.com/photo-1594564190328-0bed16a8cfa7?w=200' },
  { itemId: 'pr-rug',      name: 'Carpet/Rug',     service: 'premium', category: 'household', basePrice: 500, imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=200' },
  { itemId: 'pr-comforter', name: 'Comforter',     service: 'premium', category: 'household', basePrice: 350, imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=200' }
];

// ============================================
// Main
// ============================================
(async function main() {
  console.log(`[seed-jaipur] starting — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  await connectDB();

  // Resolve tenant
  let tenant;
  if (tenantIdArg) {
    tenant = await Tenancy.findById(tenantIdArg);
  } else if (tenantSlugArg) {
    tenant = await Tenancy.findOne({ slug: tenantSlugArg });
  } else {
    // Default: pick the most-recently-created active tenant named "laundry"
    tenant = await Tenancy.findOne({ name: /laundry/i, status: 'active' }).sort({ createdAt: -1 });
  }

  if (!tenant) {
    console.error('❌ No tenant found. Pass --tenant=<id> or --tenant-slug=<slug>.');
    process.exit(1);
  }
  console.log(`[seed-jaipur] using tenant: ${tenant.name} (${tenant._id})`);

  // We need a CenterAdmin to use as Branch.createdBy (required field).
  // Pick any one from the tenant; if none, fall back to picking the tenant
  // admin User. Failing that, we can't create branches — instruct the user.
  let createdBy = await CenterAdmin.findOne({ tenancy: tenant._id }).select('_id').lean();
  if (!createdBy) {
    createdBy = await User.findOne({ tenancy: tenant._id, role: 'admin' }).select('_id').lean();
  }
  if (!createdBy) {
    console.error('❌ No CenterAdmin or admin User found for this tenant.');
    console.error('   Branches need a createdBy. Create a tenant admin first or pass an existing tenant with admins.');
    process.exit(1);
  }
  console.log(`[seed-jaipur] createdBy: ${createdBy._id}`);

  // -------- Services (Service.code is globally unique across tenants, so we
  //          reuse a shared Service doc if one already exists for this code) --
  const serviceByCode = new Map();
  for (const s of SERVICES) {
    let svc = await Service.findOne({ code: s.code });
    if (!svc) {
      if (dryRun) {
        console.log(`[seed-jaipur] (dry) would create Service ${s.code}`);
        svc = { _id: 'dry-' + s.code, ...s };
      } else {
        svc = await Service.create({
          tenancy: tenant._id,
          name: s.displayName,
          code: s.code,
          displayName: s.displayName,
          category: s.category,
          icon: s.icon,
          turnaroundTime: s.turnaround,
          isActive: true
        });
        console.log(`[seed-jaipur] ✅ Service created: ${s.code}`);
      }
    }
    serviceByCode.set(s.code, svc);
  }

  // -------- ServiceItems (itemId is globally unique, so prefix with tenant
  //          slug so each tenant gets a fresh copy of the catalog) --------
  const itemIdPrefix = `${tenant.slug || tenant._id.toString().slice(-6)}-`;
  let itemsCreated = 0;
  let itemsSkipped = 0;
  for (const it of ITEMS) {
    const scopedItemId = `${itemIdPrefix}${it.itemId}`;
    const existing = await ServiceItem.findOne({ itemId: scopedItemId });
    if (existing) {
      // Update imageUrl if missing (so re-runs upgrade old rows)
      if (!existing.imageUrl && it.imageUrl && !dryRun) {
        await ServiceItem.updateOne({ _id: existing._id }, { $set: { imageUrl: it.imageUrl } });
      }
      itemsSkipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[seed-jaipur] (dry) would create ServiceItem ${scopedItemId}`);
    } else {
      await ServiceItem.create({
        tenancy: tenant._id,
        ...it,
        itemId: scopedItemId,
        isActive: true
      });
    }
    itemsCreated++;
  }
  console.log(`[seed-jaipur] ServiceItems → created: ${itemsCreated}, skipped (existing): ${itemsSkipped}`);

  // -------- Branches + BranchService rows --------
  let branchesCreated = 0;
  let branchesSkipped = 0;
  let branchServicesCreated = 0;
  for (const b of BRANCHES) {
    let branch = await Branch.findOne({ code: b.code });
    if (branch) {
      branchesSkipped++;
      // Ensure marketplace fields are set on existing seeded branches too
      if (!dryRun) {
        await Branch.updateOne(
          { _id: branch._id },
          {
            $set: {
              marketplaceVisible: true,
              images: branch.images?.length ? branch.images : b.images
            }
          }
        );
      }
    } else {
      if (dryRun) {
        console.log(`[seed-jaipur] (dry) would create Branch ${b.code}`);
        branch = { _id: 'dry-' + b.code };
      } else {
        branch = await Branch.create({
          tenancy: tenant._id,
          name: b.name,
          code: b.code,
          coordinates: b.coordinates, // pre-save hook fills location GeoJSON
          serviceableRadius: 15,
          marketplaceVisible: true,
          images: b.images,
          address: b.address,
          contact: b.contact,
          capacity: { maxOrdersPerDay: 100, maxWeightPerDay: 500, maxCustomersPerDay: 200, staffCount: 5 },
          operatingHours: {
            openTime: '09:00', closeTime: '21:00',
            workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
          },
          isActive: true,
          status: 'active',
          createdBy: createdBy._id
        });
        console.log(`[seed-jaipur] ✅ Branch created: ${b.code} (${b.name})`);
        branchesCreated++;
      }
    }

    // Enable all 4 services on this branch (idempotent)
    if (!dryRun) {
      for (const s of SERVICES) {
        const svc = serviceByCode.get(s.code);
        const exists = await BranchService.findOne({ branch: branch._id, service: svc._id });
        if (!exists) {
          await BranchService.create({
            branch: branch._id,
            service: svc._id,
            tenancy: tenant._id,
            createdBy: createdBy._id,
            isEnabled: true,
            isExpressAvailable: true,
            priceMultiplier: 1.0
          });
          branchServicesCreated++;
        }
      }
    }
  }
  console.log(`[seed-jaipur] Branches → created: ${branchesCreated}, skipped (existing): ${branchesSkipped}`);
  console.log(`[seed-jaipur] BranchService rows created: ${branchServicesCreated}`);

  console.log('[seed-jaipur] done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('[seed-jaipur] ❌ fatal:', err);
  process.exit(1);
});
