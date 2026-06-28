/**
 * Demo Seeder — creates the "demo" tenant with realistic seed data.
 *
 * Usage:
 *   node src/seeders/demoSeeder.js          # seed (skip if already exists)
 *   node src/seeders/demoSeeder.js --force  # wipe & recreate from scratch
 *
 * Demo credentials (all passwords: Demo@123):
 *   admin@demo.com        → Admin (full dashboard)
 *   branch@demo.com       → Branch Manager (branch-admin dashboard)
 *   customer1@demo.com    → Customer (order history, wallet, loyalty)
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Tenancy    = require('../models/Tenancy');
const User       = require('../models/User');
const Branch     = require('../models/Branch');
const Service    = require('../models/Service');
const BranchService = require('../models/BranchService');
const ServicePrice  = require('../models/ServicePrice');
const Order      = require('../models/Order');
const OrderItem  = require('../models/OrderItem');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const FORCE     = process.argv.includes('--force');
const DEMO_PASS = 'Demo@123';

// ─── helpers ────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── main ───────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected to MongoDB');

  // ── wipe existing demo data if --force ──────────────────────────────────
  const existing = await Tenancy.findOne({ slug: 'demo' });

  if (existing) {
    if (!FORCE) {
      console.log('ℹ️  Demo tenant already exists. Run with --force to recreate.');
      await mongoose.disconnect();
      return;
    }

    console.log('🗑️  Wiping existing demo data…');
    const tid = existing._id;
    const orderIds = await Order.find({ tenancy: tid }).distinct('_id');
    await OrderItem.deleteMany({ order: { $in: orderIds } });
    await Order.deleteMany({ tenancy: tid });
    await BranchService.deleteMany({ tenancy: tid });
    await ServicePrice.deleteMany({ tenancy: tid });
    await Service.deleteMany({ tenancy: tid });
    await Branch.deleteMany({ tenancy: tid });
    await Tenancy.deleteOne({ _id: tid });
    // Delete demo users last (after tenancy gone, no FK issues)
    await User.deleteMany({ email: /^(admin|branch|customer\d+)@demo\.com$/ });
    console.log('✅ Wiped');
  }

  // ── 1. Admin User (created first so Tenancy.owner can reference it) ──────
  console.log('\n👤 Creating admin user first…');

  const adminUser = await User.create({
    name: 'Demo Admin',
    email: 'admin@demo.com',
    password: DEMO_PASS,
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    phone: '9876500001',
    permissions: {
      orders:      { view: true, create: true, update: true, delete: true, assign: true, cancel: true, process: true, export: true },
      staff:       { view: true, create: true, update: true, delete: true, assignShift: true, manageAttendance: true, export: true },
      inventory:   { view: true, create: true, update: true, delete: true, restock: true, writeOff: true, export: true },
      services:    { view: true, create: true, update: true, delete: true, toggle: true, updatePricing: true, export: true },
      customers:   { view: true, create: true, update: true, delete: true, export: true },
      logistics:   { view: true, create: true, update: true, delete: true, assign: true, track: true, export: true },
      tickets:     { view: true, create: true, update: true, delete: true, assign: true, resolve: true, escalate: true, export: true },
    },
  });
  console.log(`   ✅ Admin user created: ${adminUser.email}`);

  // ── 2. Tenancy (owner = adminUser) ──────────────────────────────────────
  console.log('\n🏢 Creating demo tenancy…');
  const tenancy = await Tenancy.create({
    name: 'LaundryLobby Demo',
    slug: 'demo',
    subdomain: 'demo',
    status: 'active',
    owner: adminUser._id,
    branding: {
      businessName: 'LaundryLobby Demo',
      tagline: 'Experience world-class laundry management',
      slogan: 'Clean clothes, happy life',
      theme: {
        primaryColor: '#0EA5E9',
        secondaryColor: '#10B981',
        accentColor: '#F59E0B',
        backgroundColor: '#FFFFFF',
        textColor: '#1F2937',
        fontFamily: 'Poppins',
        layout: 'modern',
      },
      landingPageTemplate: 'original',
    },
    contact: {
      email: 'demo@laundrylobby.com',
      phone: '9876543210',
      address: {
        line1: '12, MG Road',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        country: 'India',
      },
      coordinates: { lat: 28.6139, lng: 77.2090 },
    },
    businessHours: {
      monday:    { open: '09:00', close: '20:00', isOpen: true },
      tuesday:   { open: '09:00', close: '20:00', isOpen: true },
      wednesday: { open: '09:00', close: '20:00', isOpen: true },
      thursday:  { open: '09:00', close: '20:00', isOpen: true },
      friday:    { open: '09:00', close: '20:00', isOpen: true },
      saturday:  { open: '10:00', close: '18:00', isOpen: true },
      sunday:    { open: '11:00', close: '16:00', isOpen: false },
    },
    subscription: {
      plan: 'premium',
      status: 'active',
      startDate: daysAgo(60),
      endDate: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000),
      billingCycle: 'yearly',
      features: {
        campaigns: true,
        loyalty_points: true,
        analytics: true,
        multi_branch: true,
        custom_domain: true,
        sms_notifications: true,
        max_orders: 10000,
        max_staff: 50,
        max_customers: 5000,
        max_branches: 10,
      },
    },
  });
  console.log(`   ✅ Tenancy created: ${tenancy.slug} (${tenancy._id})`);

  // Link admin back to tenancy
  adminUser.tenancy = tenancy._id;
  await adminUser.save();
  console.log(`   ✅ Admin linked to tenancy`);

  console.log('\n👤 Creating remaining users…');

  // Branch admin user (assigned to branch below)
  const branchAdminUser = await User.create({
    name: 'Demo Branch Manager',
    email: 'branch@demo.com',
    password: DEMO_PASS,
    role: 'branch_admin',
    tenancy: tenancy._id,
    isActive: true,
    isEmailVerified: true,
    phone: '9876500002',
  });
  console.log(`   ✅ Branch Admin: ${branchAdminUser.email}`);

  // 5 customers
  const customerNames = [
    'Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Verma', 'Vikram Singh'
  ];
  const customers = [];
  for (let i = 0; i < 5; i++) {
    const c = await User.create({
      name: customerNames[i],
      email: `customer${i + 1}@demo.com`,
      password: DEMO_PASS,
      role: 'customer',
      tenancy: tenancy._id,
      isActive: true,
      isEmailVerified: true,
      phone: `987650${String(i + 10).padStart(4, '0')}`,
    });
    customers.push(c);
    console.log(`   ✅ Customer: ${c.email}`);
  }

  // ── 3. Branches ──────────────────────────────────────────────────────────
  console.log('\n🏬 Creating branches…');

  const branch1 = await Branch.create({
    tenancy: tenancy._id,
    name: 'Demo Central Branch',
    code: 'DEMO-CTR',
    manager: branchAdminUser._id,
    address: {
      addressLine1: '45, Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110001',
    },
    contact: { phone: '9811234567', email: 'central@demo.com' },
    coordinates: { latitude: 28.6315, longitude: 77.2167 },
    location: { type: 'Point', coordinates: [77.2167, 28.6315] },
    isActive: true,
    capacity: { maxOrdersPerDay: 100 },
    createdBy: adminUser._id,
  });
  console.log(`   ✅ Branch: ${branch1.name}`);

  const branch2 = await Branch.create({
    tenancy: tenancy._id,
    name: 'Demo East Branch',
    code: 'DEMO-EST',
    address: {
      addressLine1: '78, Lajpat Nagar',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110024',
    },
    contact: { phone: '9899876543', email: 'east@demo.com' },
    coordinates: { latitude: 28.5674, longitude: 77.2432 },
    location: { type: 'Point', coordinates: [77.2432, 28.5674] },
    isActive: true,
    capacity: { maxOrdersPerDay: 80 },
    createdBy: adminUser._id,
  });
  console.log(`   ✅ Branch: ${branch2.name}`);

  // Assign branch admin to branch 1
  branchAdminUser.assignedBranch = branch1._id;
  await branchAdminUser.save();

  // ── 4. Services ──────────────────────────────────────────────────────────
  console.log('\n🧺 Creating services…');

  const serviceData = [
    { name: 'Wash & Fold', code: 'demo-wash-fold',    displayName: 'Wash & Fold',      category: 'laundry',      icon: 'Shirt',       turnaroundTime: { standard: 48, express: 24 } },
    { name: 'Dry Cleaning', code: 'demo-dry-clean',   displayName: 'Dry Cleaning',     category: 'dry_cleaning', icon: 'Wind',        turnaroundTime: { standard: 72, express: 36 } },
    { name: 'Steam Press',  code: 'demo-steam-press', displayName: 'Steam Press',      category: 'pressing',     icon: 'Zap',         turnaroundTime: { standard: 24, express: 12 } },
    { name: 'Express Wash', code: 'demo-express-wash',displayName: 'Express Wash',     category: 'laundry',      icon: 'Clock',       turnaroundTime: { standard: 24, express: 6 } },
    { name: 'Premium Care', code: 'demo-premium-care',displayName: 'Premium Care',     category: 'specialty',    icon: 'Star',        turnaroundTime: { standard: 96, express: 48 } },
  ];

  const services = [];
  for (const s of serviceData) {
    const svc = await Service.create({ ...s, tenancy: tenancy._id, isActive: true, createdBy: adminUser._id });
    services.push(svc);
    console.log(`   ✅ Service: ${svc.displayName}`);
  }

  // ── 5. Branch Services ────────────────────────────────────────────────────
  console.log('\n🔗 Linking services to branches…');
  const branches = [branch1, branch2];
  for (const branch of branches) {
    for (const svc of services) {
      await BranchService.create({
        branch: branch._id,
        service: svc._id,
        tenancy: tenancy._id,
        isEnabled: true,
        isExpressAvailable: true,
        createdBy: adminUser._id,
      });
    }
  }
  console.log(`   ✅ Linked ${services.length} services to ${branches.length} branches`);

  // ── 6. Service Prices ─────────────────────────────────────────────────────
  console.log('\n💰 Creating service prices…');
  const priceData = [
    { category: 'men',       garment: 'Shirt',         dryClean: 80,  steamPress: 30,  starch: 20,  alteration: 0 },
    { category: 'men',       garment: 'Trouser',        dryClean: 100, steamPress: 40,  starch: 25,  alteration: 80 },
    { category: 'men',       garment: 'Suit (2 Piece)', dryClean: 350, steamPress: 120, starch: 60,  alteration: 200 },
    { category: 'men',       garment: 'Blazer',         dryClean: 200, steamPress: 80,  starch: 50,  alteration: 150 },
    { category: 'men',       garment: 'Jacket',         dryClean: 250, steamPress: 90,  starch: 0,   alteration: 120 },
    { category: 'women',     garment: 'Saree',          dryClean: 150, steamPress: 60,  starch: 40,  alteration: 100 },
    { category: 'women',     garment: 'Salwar Kameez',  dryClean: 120, steamPress: 45,  starch: 30,  alteration: 90 },
    { category: 'women',     garment: 'Blouse',         dryClean: 80,  steamPress: 30,  starch: 20,  alteration: 70 },
    { category: 'women',     garment: 'Dress',          dryClean: 180, steamPress: 70,  starch: 0,   alteration: 130 },
    { category: 'kids',      garment: 'T-Shirt',        dryClean: 50,  steamPress: 20,  starch: 15,  alteration: 30 },
    { category: 'kids',      garment: 'Jeans',          dryClean: 70,  steamPress: 25,  starch: 0,   alteration: 40 },
    { category: 'household', garment: 'Bedsheet (Single)', dryClean: 120, steamPress: 50, starch: 30, alteration: 0 },
    { category: 'household', garment: 'Bedsheet (Double)', dryClean: 160, steamPress: 70, starch: 40, alteration: 0 },
    { category: 'household', garment: 'Curtain (per panel)', dryClean: 200, steamPress: 80, starch: 50, alteration: 100 },
  ];

  for (const p of priceData) {
    await ServicePrice.create({ ...p, tenancy: tenancy._id });
  }
  console.log(`   ✅ Created ${priceData.length} service price entries`);

  // ── 7. Orders ─────────────────────────────────────────────────────────────
  console.log('\n📦 Creating demo orders…');

  const ORDER_STATUSES = [
    'placed', 'placed',
    'assigned_to_branch', 'assigned_to_branch',
    'picked',
    'in_process', 'in_process', 'in_process',
    'ready', 'ready',
    'out_for_delivery',
    'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
    'cancelled',
  ];

  const TIME_SLOTS = ['09:00-11:00', '11:00-13:00', '14:00-16:00', '16:00-18:00'];
  const garments   = ['Shirt', 'Trouser', 'Saree', 'T-Shirt', 'Jeans', 'Suit (2 Piece)', 'Blouse'];
  const svcCodes   = ['Wash & Fold', 'Dry Cleaning', 'Steam Press', 'Express Wash', 'Premium Care'];

  const createdOrders = [];
  for (let i = 0; i < 20; i++) {
    const status    = ORDER_STATUSES[i] || 'delivered';
    const customer  = pick(customers);
    const branch    = pick(branches);
    const createdAt = daysAgo(Math.floor(Math.random() * 30) + 1);
    const pickupDate = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);
    const isExpress = i % 5 === 0;

    const itemCount = Math.floor(Math.random() * 3) + 1;
    const itemDocs  = [];
    let subtotal    = 0;

    const orderPlaceholder = new Order({ tenancy: tenancy._id }); // to get _id first
    const orderId = new mongoose.Types.ObjectId();

    for (let j = 0; j < itemCount; j++) {
      const garment   = pick(garments);
      const svcName   = pick(svcCodes);
      const basePrice = 80 + Math.floor(Math.random() * 200);
      const qty       = Math.floor(Math.random() * 3) + 1;
      subtotal += basePrice * qty;

      const unitPrice = Math.round(basePrice * (isExpress ? 1.5 : 1));
      const item = await OrderItem.create({
        order:              orderId,
        itemType:           garment,
        service:            svcName,
        category:           'normal',
        quantity:           qty,
        basePrice:          basePrice,
        serviceMultiplier:  1,
        categoryMultiplier: 1,
        expressMultiplier:  isExpress ? 1.5 : 1,
        unitPrice,
        totalPrice:         unitPrice * qty,
      });
      itemDocs.push(item._id);
    }

    const expressCharge  = isExpress ? Math.round(subtotal * 0.3) : 0;
    const deliveryCharge = 50;
    const tax            = Math.round(subtotal * 0.05);
    const total          = subtotal + expressCharge + deliveryCharge + tax;

    const orderNum = `DEMO-${String(i + 1).padStart(4, '0')}`;

    const statusHistory = [
      { status: 'placed', updatedBy: adminUser._id, updatedAt: createdAt, notes: 'Order placed' },
    ];
    if (['in_process', 'ready', 'out_for_delivery', 'delivered'].includes(status)) {
      statusHistory.push({ status: 'picked', updatedBy: adminUser._id, updatedAt: daysAgo(i), notes: 'Picked up' });
      statusHistory.push({ status: 'in_process', updatedBy: adminUser._id, updatedAt: daysAgo(i - 1), notes: 'Processing' });
    }

    const order = await Order.create({
      _id: orderId,
      tenancy:         tenancy._id,
      orderNumber:     orderNum,
      customer:        customer._id,
      branch:          branch._id,
      serviceType:     'full_service',
      pickupDate,
      pickupTimeSlot:  pick(TIME_SLOTS),
      pickupAddress: {
        name:         customer.name,
        phone:        '9876543210',
        addressLine1: `${i + 10}, Demo Street`,
        city:         'New Delhi',
        pincode:      '110001',
      },
      deliveryAddress: {
        name:         customer.name,
        phone:        '9876543210',
        addressLine1: `${i + 10}, Demo Street`,
        city:         'New Delhi',
        pincode:      '110001',
      },
      estimatedDeliveryDate: new Date(pickupDate.getTime() + 48 * 60 * 60 * 1000),
      items:           itemDocs,
      pricing: {
        subtotal,
        expressCharge,
        deliveryCharge,
        tax,
        total,
      },
      paymentMethod:   pick(['online', 'cod']),
      paymentStatus:   status === 'delivered' ? 'paid' : 'pending',
      status,
      statusHistory,
      isExpress,
    });

    createdOrders.push(order);
    if (i % 5 === 0) console.log(`   📦 ${i + 1}/20 orders created…`);
  }
  console.log(`   ✅ Created ${createdOrders.length} orders`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n🎉 Demo seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  URL:     https://demo.laundrylobby.com');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Role            Email                   Password');
  console.log('  Admin           admin@demo.com          Demo@123');
  console.log('  Branch Manager  branch@demo.com         Demo@123');
  console.log('  Customer        customer1@demo.com      Demo@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
