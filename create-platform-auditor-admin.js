const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority&serverSelectionTimeoutMS=30000&socketTimeoutMS=60000&connectTimeoutMS=30000';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define Admin schema (matching your existing structure)
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'auditor' },
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  permissions: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Define Role schema
const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  permissions: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);
const Role = mongoose.model('Role', roleSchema);

async function createPlatformAuditorAdmin() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    // Check if Platform Auditor role exists, create if not
    let auditorRole = await Role.findOne({ slug: 'platform-auditor' });
    
    if (!auditorRole) {
      console.log('📝 Creating Platform Auditor role...');
      auditorRole = new Role({
        name: 'Platform Auditor',
        slug: 'platform-auditor',
        description: 'Read-only access to all platform data for auditing purposes',
        permissions: [
          'view_all_tenants',
          'view_all_users',
          'view_all_orders',
          'view_all_payments',
          'view_all_analytics',
          'view_all_reports',
          'view_system_logs',
          'view_audit_trails',
          'export_reports',
          'view_financial_data'
        ],
        isActive: true
      });
      await auditorRole.save();
      console.log('✅ Platform Auditor role created successfully');
    } else {
      console.log('✅ Platform Auditor role already exists');
    }

    // Check if Platform Auditor admin already exists
    const existingAuditor = await Admin.findOne({ email: 'auditor@gmail.com' });
    
    if (existingAuditor) {
      console.log('⚠️  Platform Auditor admin already exists with email: auditor@gmail.com');
      
      // Update existing auditor with new role and permissions
      existingAuditor.roles = [auditorRole._id];
      existingAuditor.permissions = auditorRole.permissions;
      existingAuditor.role = 'auditor';
      existingAuditor.updatedAt = new Date();
      await existingAuditor.save();
      
      console.log('✅ Updated existing Platform Auditor admin with new role and permissions');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('auditor2025', 12);

    // Create Platform Auditor admin
    const auditorAdmin = new Admin({
      name: 'Platform Auditor',
      email: 'auditor@gmail.com',
      password: hashedPassword,
      role: 'auditor',
      roles: [auditorRole._id],
      permissions: auditorRole.permissions,
      isActive: true
    });

    await auditorAdmin.save();
    
    console.log('✅ Platform Auditor admin created successfully!');
    console.log('📧 Email: auditor@gmail.com');
    console.log('🔑 Password: auditor2025');
    console.log('👤 Role: Platform Auditor (Read-Only)');
    console.log('🔐 Permissions:', auditorRole.permissions.join(', '));
    
  } catch (error) {
    console.error('❌ Error creating Platform Auditor admin:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
createPlatformAuditorAdmin();