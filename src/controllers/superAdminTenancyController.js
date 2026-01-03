const Tenancy = require('../models/Tenancy');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendEmail, emailTemplates } = require('../config/email');
const { validationResult } = require('express-validator');

const tenancyController = {
  // Get all tenancies
  getAllTenancies: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      
      const query = { isDeleted: false };
      
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } },
          { subdomain: { $regex: search, $options: 'i' } }
        ];
      }
      
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const [tenancies, total] = await Promise.all([
        Tenancy.find(query)
          .populate('owner', 'name email phone')
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        Tenancy.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          tenancies,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get tenancies error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tenancies' });
    }
  },

  // Get single tenancy
  getTenancyById: async (req, res) => {
    try {
      const tenancy = await Tenancy.findById(req.params.id)
        .populate('owner', 'name email phone')
        .lean();
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({ success: true, data: { tenancy } });
    } catch (error) {
      console.error('Get tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tenancy' });
    }
  },

  // Create new tenancy
  createTenancy: async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array()
        });
      }

      const {
        name,
        slug,
        description,
        subdomain,
        contact,
        owner: ownerData,  // { name, email, phone, password }
        subscription
      } = req.body;
      
      // Validate required fields
      if (!name || !ownerData?.email || !ownerData?.name) {
        return res.status(400).json({
          success: false,
          message: 'Name and owner details (name, email) are required'
        });
      }
      
      // Check if slug/subdomain already exists
      const existingTenancy = await Tenancy.findOne({
        $or: [
          { slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
          { subdomain: subdomain || slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
        ]
      });
      
      if (existingTenancy) {
        return res.status(400).json({
          success: false,
          message: 'A tenancy with this name/subdomain already exists'
        });
      }
      
      // Check if owner email already exists
      const existingUser = await User.findOne({ email: ownerData.email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'A user with this email already exists'
        });
      }
      
      // Create owner (laundry admin)
      const salt = await bcrypt.genSalt(10);
      const tempPassword = ownerData.password || Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, salt);
      
      const owner = new User({
        name: ownerData.name,
        email: ownerData.email.toLowerCase(),
        phone: ownerData.phone || '0000000000',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true
      });
      
      await owner.save();
      
      // Create tenancy
      const tenancy = new Tenancy({
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description,
        subdomain: subdomain || slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        contact,
        owner: owner._id,
        subscription: subscription || {
          plan: 'trial',
          status: 'trial',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial
        },
        status: 'active',
        createdBy: req.admin._id
      });
      
      await tenancy.save();
      
      // Update owner with tenancy reference
      owner.tenancy = tenancy._id;
      await owner.save();
      
      // Send welcome email to owner
      try {
        await sendEmail({
          to: owner.email,
          subject: `Welcome to ${name} - Your Laundry Portal is Ready!`,
          html: `
            <h2>Welcome to ${name}!</h2>
            <p>Your laundry portal has been created successfully.</p>
            <p><strong>Portal URL:</strong> https://${tenancy.subdomain}.laundry-platform.com</p>
            <p><strong>Admin Login:</strong> https://${tenancy.subdomain}.laundry-platform.com/auth/login</p>
            <p><strong>Email:</strong> ${owner.email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            <p>Please change your password after first login.</p>
          `
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }
      
      res.status(201).json({
        success: true,
        message: 'Tenancy created successfully',
        data: {
          tenancy: await Tenancy.findById(tenancy._id).populate('owner', 'name email phone'),
          owner: { email: owner.email, tempPassword }
        }
      });
    } catch (error) {
      console.error('Create tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to create tenancy' });
    }
  },

  // Update tenancy
  updateTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Remove fields that shouldn't be updated directly
      delete updates.owner;
      delete updates.createdBy;
      delete updates.stats;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: 'Tenancy updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to update tenancy' });
    }
  },

  // Update tenancy status
  updateTenancyStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['active', 'inactive', 'suspended', 'pending'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: `Tenancy ${status === 'active' ? 'activated' : status}`,
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update tenancy status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update status' });
    }
  },

  // Update tenancy branding
  updateBranding: async (req, res) => {
    try {
      const { id } = req.params;
      const { branding } = req.body;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: { branding } },
        { new: true }
      );
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: 'Branding updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update branding error:', error);
      res.status(500).json({ success: false, message: 'Failed to update branding' });
    }
  },

  // Update subscription
  updateSubscription: async (req, res) => {
    try {
      const { id } = req.params;
      const { subscription } = req.body;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: { subscription } },
        { new: true }
      );
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update subscription error:', error);
      res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
  },

  // Delete tenancy (soft delete)
  deleteTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { isDeleted: true, deletedAt: new Date(), status: 'inactive' },
        { new: true }
      );
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      // Deactivate owner
      await User.findByIdAndUpdate(tenancy.owner, { isActive: false });
      
      res.json({
        success: true,
        message: 'Tenancy deleted successfully'
      });
    } catch (error) {
      console.error('Delete tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete tenancy' });
    }
  },

  // Get tenancy stats
  getTenancyStats: async (req, res) => {
    try {
      const [
        totalTenancies,
        activeTenancies,
        trialTenancies,
        suspendedTenancies
      ] = await Promise.all([
        Tenancy.countDocuments({ isDeleted: false }),
        Tenancy.countDocuments({ status: 'active', isDeleted: false }),
        Tenancy.countDocuments({ 'subscription.status': 'trial', isDeleted: false }),
        Tenancy.countDocuments({ status: 'suspended', isDeleted: false })
      ]);
      
      res.json({
        success: true,
        data: {
          stats: {
            total: totalTenancies,
            active: activeTenancies,
            trial: trialTenancies,
            suspended: suspendedTenancies
          }
        }
      });
    } catch (error) {
      console.error('Get tenancy stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
  }
};

module.exports = tenancyController;
