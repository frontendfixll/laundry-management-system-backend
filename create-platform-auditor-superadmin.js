const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority&serverSelectionTimeoutMS=30000&socketTimeoutMS=60000&connectTimeoutMS=30000';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define SuperAdmin schema (matching the model)
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  location: { type: String },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

const superAdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'superadmin' },
  sessions: [sessionSchema],
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  lastLoginIP: { type: String },
  lastActivity: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdminRole'
  }],
  permissions: {
    branches: { type: Boolean, default: true },
    users: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    finances: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    settings: { type: Boolean, default: true },
    admins: { type: Boolean, default: true },
    pricing: { type: Boolean, default: true },
    audit: { type: Boolean, default: true },
    superadmins: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: true },
      export: { type: Boolean, default: true }
    }
  },
  phone: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Define SuperAdminRole schema
const superAdminRoleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  color: { type: String, default: '#6366f1' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);
const SuperAdminRole = mongoose.model('SuperAdminRole', superAdminRoleSchema);

async function createPlatformAuditorSuperAdmin() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    // Check if Platform Auditor role exists, create if not
    let auditorRole = await SuperAdminRole.findOne({ slug: 'platform-read-only-auditor' });
    
    if (!auditorRole) {
      console.log('📝 Creating Platform Read-Only Auditor SuperAdmin role...');
      auditorRole = new SuperAdminRole({
        name: 'Platform Read-Only Auditor',
        slug: 'platform-read-only-auditor',
        description: 'Read-only access to all platform data for auditing purposes',
        permissions: {
          // Audit permissions
          audit_logs: {
            view: true,
            export: true
          },
          // View permissions for all modules
          tenants: {
            view: true
          },
          users: {
            view: true
          },
          orders: {
            view: true
          },
          payments: {
            view: true
          },
          analytics: {
            view: true
          },
          reports: {
            view: true,
            export: true
          },
          system_logs: {
            view: true
          },
          compliance: {
            view: true
          },
          security: {
            view: true
          },
          financial_data: {
            view: true
          }
        },
        color: '#f97316', // Orange color for auditor
        isActive: true
      });
      await auditorRole.save();
      console.log('✅ Platform Read-Only Auditor SuperAdmin role created successfully');
    } else {
      console.log('✅ Platform Read-Only Auditor SuperAdmin role already exists');
    }

    // Check if Platform Auditor SuperAdmin already exists
    const existingAuditor = await SuperAdmin.findOne({ email: 'auditor@gmail.com' });
    
    if (existingAuditor) {
      console.log('⚠️  Platform Read-Only Auditor SuperAdmin already exists with email: auditor@gmail.com');
      
      // Update existing auditor with new role and permissions
      existingAuditor.roles = [auditorRole._id];
      existingAuditor.role = 'auditor';
      existingAuditor.permissions = {
        branches: false,
        users: true,
        orders: true,
        finances: true,
        analytics: true,
        settings: false,
        admins: false,
        pricing: false,
        audit: true,
        superadmins: {
          view: true,
          create: false,
          update: false,
          delete: false,
          export: true
        }
      };
      existingAuditor.updatedAt = new Date();
      await existingAuditor.save();
      
      console.log('✅ Updated existing Platform Read-Only Auditor SuperAdmin with new role and permissions');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('auditor2025', 12);

    // Create Platform Read-Only Auditor SuperAdmin
    const auditorSuperAdmin = new SuperAdmin({
      name: 'Platform Read-Only Auditor',
      email: 'auditor@gmail.com',
      password: hashedPassword,
      role: 'auditor',
      roles: [auditorRole._id],
      permissions: {
        branches: false,
        users: true,
        orders: true,
        finances: true,
        analytics: true,
        settings: false,
        admins: false,
        pricing: false,
        audit: true,
        superadmins: {
          view: true,
          create: false,
          update: false,
          delete: false,
          export: true
        }
      },
      isActive: true
    });

    await auditorSuperAdmin.save();
    
    console.log('✅ Platform Read-Only Auditor SuperAdmin created successfully!');
    console.log('📧 Email: auditor@gmail.com');
    console.log('🔑 Password: auditor2025');
    console.log('👤 Role: Platform Read-Only Auditor (Comprehensive Audit Access)');
    console.log('🎭 SuperAdmin Role:', auditorRole.name);
    console.log('🔐 Collection: SuperAdmin (correct for SuperAdmin auth)');
    
  } catch (error) {
    console.error('❌ Error creating Platform Read-Only Auditor SuperAdmin:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
createPlatformAuditorSuperAdmin();