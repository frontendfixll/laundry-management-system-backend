const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority&serverSelectionTimeoutMS=30000&socketTimeoutMS=60000&connectTimeoutMS=30000';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define schemas
const adminSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  permissions: [String],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
});

const salesUserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  designation: String,
  isActive: Boolean,
  createdAt: Date
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  isActive: Boolean,
  createdAt: Date
});

const roleSchema = new mongoose.Schema({
  name: String,
  slug: String,
  description: String,
  permissions: [String],
  isActive: Boolean,
  createdAt: Date
});

const Admin = mongoose.model('Admin', adminSchema);
const SalesUser = mongoose.model('SalesUser', salesUserSchema);
const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);

async function checkAuditorUser() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    // Check in Admin collection
    console.log('\n📋 Checking Admin collection...');
    const adminAuditor = await Admin.findOne({ email: 'auditor@gmail.com' }).populate('roles');
    if (adminAuditor) {
      console.log('✅ Found auditor in Admin collection:');
      console.log('   📧 Email:', adminAuditor.email);
      console.log('   👤 Name:', adminAuditor.name);
      console.log('   🔑 Role:', adminAuditor.role);
      console.log('   🎭 RBAC Roles:', adminAuditor.roles?.map(r => r.name).join(', ') || 'None');
      console.log('   🔐 Permissions:', adminAuditor.permissions?.join(', ') || 'None');
      console.log('   ✅ Active:', adminAuditor.isActive);
      console.log('   📅 Created:', adminAuditor.createdAt);
    } else {
      console.log('❌ Auditor NOT found in Admin collection');
    }

    // Check in SalesUser collection
    console.log('\n📋 Checking SalesUser collection...');
    const salesAuditor = await SalesUser.findOne({ email: 'auditor@gmail.com' });
    if (salesAuditor) {
      console.log('✅ Found auditor in SalesUser collection:');
      console.log('   📧 Email:', salesAuditor.email);
      console.log('   👤 Name:', salesAuditor.name);
      console.log('   🔑 Role:', salesAuditor.role);
      console.log('   💼 Designation:', salesAuditor.designation);
      console.log('   ✅ Active:', salesAuditor.isActive);
      console.log('   📅 Created:', salesAuditor.createdAt);
    } else {
      console.log('❌ Auditor NOT found in SalesUser collection');
    }

    // Check in User collection
    console.log('\n📋 Checking User collection...');
    const userAuditor = await User.findOne({ email: 'auditor@gmail.com' });
    if (userAuditor) {
      console.log('✅ Found auditor in User collection:');
      console.log('   📧 Email:', userAuditor.email);
      console.log('   👤 Name:', userAuditor.name);
      console.log('   🔑 Role:', userAuditor.role);
      console.log('   ✅ Active:', userAuditor.isActive);
      console.log('   📅 Created:', userAuditor.createdAt);
    } else {
      console.log('❌ Auditor NOT found in User collection');
    }

    // Check Platform Auditor role
    console.log('\n📋 Checking Platform Auditor role...');
    const auditorRole = await Role.findOne({ slug: 'platform-auditor' });
    if (auditorRole) {
      console.log('✅ Found Platform Auditor role:');
      console.log('   🏷️  Name:', auditorRole.name);
      console.log('   🔗 Slug:', auditorRole.slug);
      console.log('   📝 Description:', auditorRole.description);
      console.log('   🔐 Permissions:', auditorRole.permissions?.join(', ') || 'None');
      console.log('   ✅ Active:', auditorRole.isActive);
    } else {
      console.log('❌ Platform Auditor role NOT found');
    }

    // Summary
    console.log('\n📊 SUMMARY:');
    console.log('   Admin Collection:', adminAuditor ? '✅ Found' : '❌ Not Found');
    console.log('   SalesUser Collection:', salesAuditor ? '✅ Found' : '❌ Not Found');
    console.log('   User Collection:', userAuditor ? '✅ Found' : '❌ Not Found');
    console.log('   Platform Auditor Role:', auditorRole ? '✅ Found' : '❌ Not Found');

    if (adminAuditor) {
      console.log('\n🎯 RECOMMENDATION: Auditor should login via SuperAdmin endpoint (/api/superadmin/auth/login)');
    } else if (salesAuditor) {
      console.log('\n🎯 RECOMMENDATION: Auditor should login via Sales endpoint (/api/sales/auth/login)');
    } else if (userAuditor) {
      console.log('\n🎯 RECOMMENDATION: Auditor should login via regular auth endpoint (/api/auth/login)');
    } else {
      console.log('\n⚠️  WARNING: Auditor user not found in any collection!');
    }
    
  } catch (error) {
    console.error('❌ Error checking auditor user:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
checkAuditorUser();