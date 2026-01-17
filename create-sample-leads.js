const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority';

// Define Lead schema
const leadSchema = new mongoose.Schema({
  businessName: String,
  contactPerson: {
    name: String,
    email: String,
    phone: String,
    designation: String
  },
  businessDetails: {
    type: String,
    size: String,
    location: {
      address: String,
      city: String,
      state: String,
      pincode: String
    }
  },
  source: String,
  status: String,
  priority: String,
  estimatedRevenue: Number,
  notes: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesUser' },
  trial: {
    isActive: Boolean,
    startDate: Date,
    endDate: Date,
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan' }
  },
  followUpDate: Date,
  lastContactDate: Date,
  tags: [String],
  activities: [{
    type: String,
    description: String,
    date: Date,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesUser' }
  }]
}, { timestamps: true });

const Lead = mongoose.model('Lead', leadSchema);

async function createSampleLeads() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get sales user ID
    const SalesUser = mongoose.model('SalesUser', new mongoose.Schema({}, { strict: false }));
    const salesUser = await SalesUser.findOne({ email: 'virat@sales.com' });
    
    if (!salesUser) {
      console.log('❌ Sales user not found');
      process.exit(1);
    }

    console.log('✅ Found sales user:', salesUser.name);

    // Get a billing plan
    const BillingPlan = mongoose.model('BillingPlan', new mongoose.Schema({}, { strict: false }));
    const plan = await BillingPlan.findOne({ isActive: true });

    const sampleLeads = [
      {
        businessName: 'Clean & Fresh Laundry',
        businessType: 'laundry',
        contactPerson: {
          name: 'Rajesh Kumar',
          email: 'rajesh@cleanfresh.com',
          phone: '+91 9876543210',
          designation: 'Owner'
        },
        address: {
          line1: '123 MG Road',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India'
        },
        source: 'website',
        status: 'new',
        priority: 'high',
        estimatedRevenue: 50000,
        notes: 'Interested in digital transformation',
        assignedTo: salesUser._id,
        trial: {
          isActive: true,
          startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
          planId: plan?._id
        },
        nextFollowUp: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        businessName: 'Sparkle Dry Cleaners',
        businessType: 'dry_cleaning',
        contactPerson: {
          name: 'Priya Sharma',
          email: 'priya@sparkledry.com',
          phone: '+91 9876543211',
          designation: 'Manager'
        },
        address: {
          line1: '456 Park Street',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India'
        },
        source: 'referral',
        status: 'contacted',
        priority: 'medium',
        estimatedRevenue: 75000,
        notes: 'Needs demo next week',
        assignedTo: salesUser._id,
        trial: {
          isActive: false
        },
        nextFollowUp: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        businessName: 'Royal Wash Center',
        businessType: 'chain',
        contactPerson: {
          name: 'Amit Patel',
          email: 'amit@royalwash.com',
          phone: '+91 9876543212',
          designation: 'CEO'
        },
        address: {
          line1: '789 Commercial Street',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001',
          country: 'India'
        },
        source: 'cold_call',
        status: 'qualified',
        priority: 'high',
        estimatedRevenue: 150000,
        notes: 'Multi-location setup required',
        assignedTo: salesUser._id,
        trial: {
          isActive: true,
          startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
          endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
          planId: plan?._id
        },
        nextFollowUp: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date()
      },
      {
        businessName: 'Quick Clean Express',
        businessType: 'laundry',
        contactPerson: {
          name: 'Sunita Reddy',
          email: 'sunita@quickclean.com',
          phone: '+91 9876543213',
          designation: 'Owner'
        },
        address: {
          line1: '321 Main Road',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
          country: 'India'
        },
        source: 'social_media',
        status: 'converted',
        priority: 'medium',
        estimatedRevenue: 40000,
        notes: 'Successfully converted to paid plan',
        assignedTo: salesUser._id,
        trial: {
          isActive: false,
          startDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          planId: plan?._id
        },
        nextFollowUp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        businessName: 'Premium Laundry Services',
        businessType: 'laundry',
        contactPerson: {
          name: 'Vikash Singh',
          email: 'vikash@premiumlaundry.com',
          phone: '+91 9876543214',
          designation: 'Director'
        },
        address: {
          line1: '654 Business District',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411001',
          country: 'India'
        },
        source: 'event',
        status: 'demo_scheduled',
        priority: 'high',
        estimatedRevenue: 100000,
        notes: 'Demo scheduled for tomorrow',
        assignedTo: salesUser._id,
        trial: {
          isActive: false
        },
        nextFollowUp: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      }
    ];

    // Clear existing leads
    await Lead.deleteMany({});
    console.log('🗑️ Cleared existing leads');

    // Insert sample leads
    const createdLeads = await Lead.insertMany(sampleLeads);
    console.log(`✅ Created ${createdLeads.length} sample leads\n`);

    createdLeads.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.businessName}`);
      console.log(`   📧 Contact: ${lead.contactPerson.name} (${lead.contactPerson.email})`);
      console.log(`   📍 Location: ${lead.address?.city || 'N/A'}`);
      console.log(`   📊 Status: ${lead.status}`);
      console.log(`   💰 Revenue: ₹${lead.estimatedRevenue || 0}`);
      console.log(`   🔄 Trial: ${lead.trial?.isActive ? 'Active' : 'Inactive'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createSampleLeads();