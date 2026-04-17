const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority&serverSelectionTimeoutMS=30000&socketTimeoutMS=60000&connectTimeoutMS=30000';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define schemas
const superAdminSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SuperAdminRole' }],
  permissions: mongoose.Schema.Types.Mixed,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
});

const superAdminRoleSchema = new mongoose.Schema({
  name: String,
  slug: String,
  description: String,
  permissions: mongoose.Schema.Types.Mixed,
  color: String,
  isActive: Boolean,
  createdAt: Date
});

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);
const SuperAdminRole = mongoose.model('SuperAdminRole', superAdminRoleSchema);

async function verifyAuditorSuperAdmin() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    // Check SuperAdmin collection
    console.log('\n📋 Checking SuperAdmin collection...');
    const auditorSuperAdmin = await SuperAdmin.findOne({ email: 'auditor@gmail.com' }).populate('roles');
    if (auditorSuperAdmin) {
      console.log('✅ Found auditor in SuperAdmin collection:');
      console.log('   📧 Email:', auditorSuperAdmin.email);
      console.log('   👤 Name:', auditorSuperAdmin.name);
      console.log('   🔑 Role:', auditorSuperAdmin.role);
      console.log('   🎭 RBAC Roles:', auditorSuperAdmin.roles?.map(r => r.name).join(', ') || 'None');
      console.log('   ✅ Active:', auditorSuperAdmin.isActive);
      console.log('   📅 Created:', auditorSuperAdmin.createdAt);
      console.log('   🔐 Permissions Sample:', JSON.stringify(auditorSuperAdmin.permissions, null, 2));
    } else {
      console.log('❌ Auditor NOT found in SuperAdmin collection');
    }

    // Check SuperAdminRole collection
    console.log('\n📋 Checking SuperAdminRole collection...');
    const auditorRole = await SuperAdminRole.findOne({ slug: 'platform-auditor' });
    if (auditorRole) {
      console.log('✅ Found Platform Auditor role in SuperAdminRole collection:');
      console.log('   🏷️  Name:', auditorRole.name);
      console.log('   🔗 Slug:', auditorRole.slug);
      console.log('   📝 Description:', auditorRole.description);
      console.log('   🎨 Color:', auditorRole.color);
      console.log('   ✅ Active:', auditorRole.isActive);
      console.log('   🔐 Permissions Sample:', JSON.stringify(auditorRole.permissions, null, 2));
    } else {
      console.log('❌ Platform Auditor role NOT found in SuperAdminRole collection');
    }

    // Summary
    console.log('\n📊 VERIFICATION SUMMARY:');
    console.log('   SuperAdmin Collection:', auditorSuperAdmin ? '✅ Found' : '❌ Not Found');
    console.log('   SuperAdminRole Collection:', auditorRole ? '✅ Found' : '❌ Not Found');
    console.log('   Login Endpoint: /api/superadmin/auth/login');
    console.log('   Credentials: auditor@gmail.com / auditor2025');

    if (auditorSuperAdmin && auditorRole) {
      console.log('\n🎯 STATUS: ✅ Auditor login should work now!');
    } else {
      console.log('\n🎯 STATUS: ❌ Auditor login may still have issues');
    }
    
  } catch (error) {
    console.error('❌ Error verifying auditor:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
verifyAuditorSuperAdmin();