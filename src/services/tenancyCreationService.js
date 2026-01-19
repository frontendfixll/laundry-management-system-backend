/**
 * Tenancy Creation Service
 * Handles complete tenancy setup with isolated admin credentials
 */

const User = require('../models/User');
const Tenancy = require('../models/Tenancy');
const bcrypt = require('bcryptjs');
const { generateAccessToken } = require('../utils/jwt');
const NotificationService = require('./notificationService');

class TenancyCreationService {
  /**
   * Create a new tenancy with isolated admin user
   * @param {Object} tenancyData - Tenancy information
   * @param {Object} adminData - Admin user information
   * @returns {Object} Created tenancy and admin user
   */
  static async createTenancyWithAdmin(tenancyData, adminData) {
    try {
      console.log('🏢 Creating new tenancy with admin:', {
        tenancyName: tenancyData.name,
        adminEmail: adminData.email
      });

      // Validate required data
      if (!tenancyData.name || !adminData.email || !adminData.name || !adminData.password) {
        throw new Error('Missing required tenancy or admin data');
      }

      // Check if admin email already exists
      const existingUser = await User.findOne({ 
        email: adminData.email.toLowerCase() 
      });
      
      if (existingUser) {
        throw new Error(`User with email ${adminData.email} already exists`);
      }

      // Check if tenancy name/slug already exists
      const slug = tenancyData.slug || tenancyData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const existingTenancy = await Tenancy.findOne({
        $or: [
          { name: tenancyData.name },
          { slug: slug }
        ]
      });

      if (existingTenancy) {
        throw new Error(`Tenancy with name "${tenancyData.name}" already exists`);
      }

      // Generate unique subdomain
      let subdomain = tenancyData.subdomain || slug;
      let subdomainCounter = 1;
      
      while (await Tenancy.findOne({ subdomain })) {
        subdomain = `${slug}-${subdomainCounter}`;
        subdomainCounter++;
      }

      // Create tenancy first
      const tenancy = new Tenancy({
        name: tenancyData.name,
        slug: slug,
        subdomain: subdomain,
        description: tenancyData.description || '',
        status: tenancyData.status || 'trial',
        
        // Contact information
        contact: {
          email: adminData.email,
          phone: adminData.phone || '',
          address: tenancyData.address || {}
        },
        
        // Branding
        branding: {
          businessName: tenancyData.businessName || tenancyData.name,
          tagline: tenancyData.tagline || '',
          theme: {
            primaryColor: '#3B82F6',
            secondaryColor: '#10B981',
            accentColor: '#F59E0B'
          }
        },
        
        // Subscription
        subscription: {
          plan: tenancyData.plan || 'trial',
          status: 'trial',
          startDate: new Date(),
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
          features: tenancyData.features || {
            // Default trial features
            orders: true,
            customers: true,
            inventory: true,
            basic_analytics: true,
            email_notifications: true
          }
        },
        
        // Business hours (default)
        businessHours: {
          monday: { open: '09:00', close: '18:00', isOpen: true },
          tuesday: { open: '09:00', close: '18:00', isOpen: true },
          wednesday: { open: '09:00', close: '18:00', isOpen: true },
          thursday: { open: '09:00', close: '18:00', isOpen: true },
          friday: { open: '09:00', close: '18:00', isOpen: true },
          saturday: { open: '09:00', close: '16:00', isOpen: true },
          sunday: { open: '10:00', close: '14:00', isOpen: false }
        }
      });

      await tenancy.save();
      console.log('✅ Tenancy created:', tenancy._id);

      // Hash admin password
      const hashedPassword = await bcrypt.hash(adminData.password, 12);

      // Create admin user with tenancy reference
      const adminUser = new User({
        name: adminData.name,
        email: adminData.email.toLowerCase(),
        phone: adminData.phone || '',
        password: hashedPassword,
        role: 'admin',
        tenancy: tenancy._id, // CRITICAL: Link admin to tenancy
        
        // Admin permissions (full access to their tenancy)
        permissions: {
          orders: { view: true, create: true, update: true, delete: true, assign: true, cancel: true, process: true },
          staff: { view: true, create: true, update: true, delete: true, assignShift: true, manageAttendance: true },
          inventory: { view: true, create: true, update: true, delete: true, restock: true, writeOff: true },
          services: { view: true, create: true, update: true, delete: true, toggle: true, updatePricing: true },
          customers: { view: true, create: true, update: true, delete: true },
          logistics: { view: true, create: true, update: true, delete: true, assign: true, track: true },
          tickets: { view: true, create: true, update: true, delete: true, assign: true, resolve: true, escalate: true },
          performance: { view: true, create: true, update: true, delete: true, export: true },
          analytics: { view: true },
          settings: { view: true, update: true },
          billing: { view: true },
          campaigns: { view: true, create: true, update: true, delete: true },
          banners: { view: true, create: true, update: true, delete: true },
          coupons: { view: true, create: true, update: true, delete: true }
        },
        
        isEmailVerified: true, // Auto-verify for admin created by SuperAdmin
        isActive: true,
        createdBy: 'superadmin'
      });

      await adminUser.save();
      console.log('✅ Admin user created:', adminUser._id);

      // Update tenancy with owner reference
      tenancy.owner = adminUser._id;
      await tenancy.save();

      // Send welcome notification to admin
      try {
        await NotificationService.notifyAdminCreated(
          adminUser._id,
          tenancy._id,
          'SuperAdmin'
        );
      } catch (notifError) {
        console.error('Failed to send welcome notification:', notifError);
        // Don't fail tenancy creation if notification fails
      }

      // Log successful creation
      console.log('🎉 Tenancy creation completed:', {
        tenancyId: tenancy._id,
        tenancyName: tenancy.name,
        subdomain: tenancy.subdomain,
        adminId: adminUser._id,
        adminEmail: adminUser.email
      });

      return {
        tenancy: {
          id: tenancy._id,
          name: tenancy.name,
          slug: tenancy.slug,
          subdomain: tenancy.subdomain,
          status: tenancy.status,
          businessName: tenancy.branding.businessName,
          subscription: tenancy.subscription
        },
        admin: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          tenancy: tenancy._id
        },
        loginCredentials: {
          email: adminUser.email,
          password: adminData.password, // Return original password for SuperAdmin
          loginUrl: `https://${tenancy.subdomain}.laundrylobby.com/auth/login`
        }
      };

    } catch (error) {
      console.error('❌ Tenancy creation failed:', error);
      
      // Cleanup on failure
      try {
        if (error.tenancyId) {
          await Tenancy.findByIdAndDelete(error.tenancyId);
        }
        if (error.adminId) {
          await User.findByIdAndDelete(error.adminId);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Validate tenancy data before creation
   */
  static validateTenancyData(tenancyData, adminData) {
    const errors = [];

    // Tenancy validation
    if (!tenancyData.name || tenancyData.name.trim().length < 2) {
      errors.push('Tenancy name must be at least 2 characters long');
    }

    if (tenancyData.name && tenancyData.name.length > 100) {
      errors.push('Tenancy name cannot exceed 100 characters');
    }

    // Admin validation
    if (!adminData.name || adminData.name.trim().length < 2) {
      errors.push('Admin name must be at least 2 characters long');
    }

    if (!adminData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminData.email)) {
      errors.push('Valid admin email is required');
    }

    if (!adminData.password || adminData.password.length < 6) {
      errors.push('Admin password must be at least 6 characters long');
    }

    if (adminData.phone && !/^\+?[\d\s\-\(\)]{10,}$/.test(adminData.phone)) {
      errors.push('Invalid phone number format');
    }

    return errors;
  }

  /**
   * Generate secure random password for admin
   */
  static generateSecurePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }

  /**
   * Check if tenancy name/slug is available
   */
  static async checkTenancyAvailability(name, slug) {
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    const existing = await Tenancy.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { slug: finalSlug }
      ]
    });

    return {
      available: !existing,
      suggestedSlug: existing ? `${finalSlug}-${Date.now()}` : finalSlug
    };
  }

  /**
   * Get tenancy creation summary
   */
  static async getTenancyCreationSummary(tenancyId) {
    try {
      const tenancy = await Tenancy.findById(tenancyId).populate('owner', 'name email role');
      
      if (!tenancy) {
        throw new Error('Tenancy not found');
      }

      return {
        tenancy: {
          id: tenancy._id,
          name: tenancy.name,
          slug: tenancy.slug,
          subdomain: tenancy.subdomain,
          status: tenancy.status,
          createdAt: tenancy.createdAt
        },
        admin: tenancy.owner ? {
          id: tenancy.owner._id,
          name: tenancy.owner.name,
          email: tenancy.owner.email,
          role: tenancy.owner.role
        } : null,
        urls: {
          adminLogin: `https://${tenancy.subdomain}.laundrylobby.com/auth/login`,
          customerSite: `https://${tenancy.subdomain}.laundrylobby.com`,
          superAdminManage: `/tenancies/${tenancy._id}`
        }
      };
    } catch (error) {
      console.error('Get tenancy summary error:', error);
      throw error;
    }
  }
}

module.exports = TenancyCreationService;