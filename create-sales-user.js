const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect('mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define SalesUser schema (simplified)
const salesUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  employeeId: { type: String, unique: true },
  designation: String,
  role: { type: String, default: 'sales_admin' },
  permissions: {
    leads: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: true },
      export: { type: Boolean, default: true },
    },
    trials: {
      view: { type: Boolean, default: true },
      extend: { type: Boolean, default: true },
      convert: { type: Boolean, default: true },
    },
    subscriptions: {
      view: { type: Boolean, default: true },
      activate: { type: Boolean, default: true },
      pause: { type: Boolean, default: true },
      upgrade: { type: Boolean, default: true },
      downgrade: { type: Boolean, default: true },
    },
    plans: {
      view: { type: Boolean, default: true },
      assign: { type: Boolean, default: true },
      customPricing: { type: Boolean, default: false },
      createPlan: { type: Boolean, default: false },
    },
    payments: {
      view: { type: Boolean, default: true },
      generateLink: { type: Boolean, default: true },
      recordOffline: { type: Boolean, default: true },
      markPaid: { type: Boolean, default: true },
    },
    analytics: {
      view: { type: Boolean, default: true },
      export: { type: Boolean, default: true },
    },
  },
  performance: {
    leadsAssigned: { type: Number, default: 0 },
    leadsConverted: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    currentMonthRevenue: { type: Number, default: 0 },
    target: { type: Number, default: 0 },
    targetAchieved: { type: Number, default: 0 },
  },
  isActive: { type: Boolean, default: true },
  sessions: [],
}, { timestamps: true });

const SalesUser = mongoose.model('SalesUser', salesUserSchema);

async function createSalesUser() {
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash('sales123', 10);

    // Create sales user
    const salesUser = await SalesUser.create({
      name: 'Virat Sales',
      email: 'virat@sales.com',
      password: hashedPassword,
      phone: '9876543210',
      employeeId: 'SALES001',
      designation: 'Sales Manager',
      role: 'sales_admin',
      isActive: true,
    });

    console.log('✅ Sales user created successfully!');
    console.log('📧 Email: virat@sales.com');
    console.log('🔑 Password: sales123');
    console.log('👤 Name:', salesUser.name);
    console.log('🆔 Employee ID:', salesUser.employeeId);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating sales user:', error.message);
    process.exit(1);
  }
}

createSalesUser();
