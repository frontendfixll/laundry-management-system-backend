const Complaint = require('../models/Complaint')
const BlacklistEntry = require('../models/Blacklist')
const SLAConfig = require('../models/SLAConfig')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

class CenterAdminRiskController {
  // Get risk management overview
  async getRiskOverview(req, res) {
    try {
      const { timeframe = '30d' } = req.query
      
      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      
      switch (timeframe) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(endDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(endDate.getDate() - 90)
          break
        default:
          startDate.setDate(endDate.getDate() - 30)
      }

      // Get complaint statistics
      const complaintStats = await Complaint.getComplaintStats({
        createdAt: { $gte: startDate, $lte: endDate }
      })

      // Get escalated complaints
      const escalatedComplaints = await Complaint.getEscalatedComplaints()

      // Get SLA breaches
      const slaBreaches = await Complaint.getSLABreaches()

      // Get fraud suspicious cases
      const fraudSuspicious = await Complaint.getFraudSuspicious()

      // Get blacklist statistics
      const blacklistStats = await BlacklistEntry.getBlacklistStats()

      // Get pending appeals
      const pendingAppeals = await BlacklistEntry.getPendingAppeals()

      // Get high-risk entries
      const highRiskEntries = await BlacklistEntry.getHighRiskEntries()

      return res.json({
        success: true,
        data: {
          overview: {
            complaintStats,
            escalatedComplaints: escalatedComplaints.length,
            slaBreaches: slaBreaches.length,
            fraudSuspicious: fraudSuspicious.length,
            blacklistStats,
            pendingAppeals: pendingAppeals.length,
            highRiskEntries: highRiskEntries.length
          },
          escalatedComplaints: escalatedComplaints.slice(0, 10), // Top 10
          slaBreaches: slaBreaches.slice(0, 10), // Top 10
          fraudSuspicious: fraudSuspicious.slice(0, 10), // Top 10
          timeframe
        }
      })
    } catch (error) {
      console.error('Get risk overview error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch risk overview'
      })
    }
  }

  // Get all complaints with filters
  async getComplaints(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        category,
        severity,
        priority,
        isEscalated,
        slaBreached,
        fraudRisk,
        startDate,
        endDate,
        branchId,
        customerId,
        assignedTo,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (status) query.status = status
      if (category) query.category = category
      if (severity) query.severity = severity
      if (priority) query.priority = priority
      if (isEscalated === 'true') query.isEscalated = true
      if (slaBreached === 'true') query.slaBreached = true
      if (fraudRisk) query.fraudRisk = fraudRisk
      if (branchId) query.branchId = branchId
      if (customerId) query.customerId = customerId
      if (assignedTo) query.assignedTo = assignedTo
      
      if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) query.createdAt.$gte = new Date(startDate)
        if (endDate) query.createdAt.$lte = new Date(endDate)
      }
      
      if (search) {
        query.$or = [
          { complaintId: { $regex: search, $options: 'i' } },
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } }
        ]
      }

      // Execute query
      const complaints = await Complaint.find(query)
        .populate('customerId', 'name email phone')
        .populate('branchId', 'name location')
        .populate('orderId', 'orderNumber')
        .populate('assignedTo')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await Complaint.countDocuments(query)

      return res.json({
        success: true,
        data: {
          complaints,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get complaints error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch complaints'
      })
    }
  }

  // Get single complaint
  async getComplaint(req, res) {
    try {
      const { complaintId } = req.params

      const complaint = await Complaint.findById(complaintId)
        .populate('customerId', 'name email phone')
        .populate('branchId', 'name location')
        .populate('orderId', 'orderNumber items')
        .populate('assignedTo')
        .populate('escalatedBy', 'name email')
        .populate('resolvedBy')
        .populate('actions.performedBy')

      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found'
        })
      }

      return res.json({
        success: true,
        data: { complaint }
      })
    } catch (error) {
      console.error('Get complaint error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch complaint'
      })
    }
  }

  // Escalate complaint
  async escalateComplaint(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { complaintId } = req.params
      const { reason, level } = req.body

      const complaint = await Complaint.findById(complaintId)
      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found'
        })
      }

      // Escalate the complaint
      await complaint.escalate(req.admin._id, reason, level)

      // Log the escalation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'escalate_complaint',
        category: 'risk_management',
        description: `Escalated complaint ${complaint.complaintId} to level ${complaint.escalationLevel}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'complaint',
        resourceId: complaint._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          complaintId: complaint.complaintId,
          escalationLevel: complaint.escalationLevel,
          reason
        }
      })

      return res.json({
        success: true,
        message: 'Complaint escalated successfully',
        data: { complaint }
      })
    } catch (error) {
      console.error('Escalate complaint error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to escalate complaint'
      })
    }
  }

  // Assign complaint
  async assignComplaint(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { complaintId } = req.params
      const { assignedTo, assignedToModel } = req.body

      const complaint = await Complaint.findById(complaintId)
      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found'
        })
      }

      // Assign the complaint
      await complaint.assign(assignedTo, req.admin._id, assignedToModel)

      // Log the assignment
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'assign_complaint',
        category: 'risk_management',
        description: `Assigned complaint ${complaint.complaintId} to ${assignedToModel}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'complaint',
        resourceId: complaint._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          complaintId: complaint.complaintId,
          assignedTo,
          assignedToModel
        }
      })

      return res.json({
        success: true,
        message: 'Complaint assigned successfully',
        data: { complaint }
      })
    } catch (error) {
      console.error('Assign complaint error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to assign complaint'
      })
    }
  }

  // Resolve complaint
  async resolveComplaint(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { complaintId } = req.params
      const { resolution, resolutionType, amount } = req.body

      const complaint = await Complaint.findById(complaintId)
      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found'
        })
      }

      // Resolve the complaint
      await complaint.resolve(req.admin._id, resolution, resolutionType, amount)

      // Log the resolution
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'resolve_complaint',
        category: 'risk_management',
        description: `Resolved complaint ${complaint.complaintId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'complaint',
        resourceId: complaint._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          complaintId: complaint.complaintId,
          resolutionType,
          amount
        }
      })

      return res.json({
        success: true,
        message: 'Complaint resolved successfully',
        data: { complaint }
      })
    } catch (error) {
      console.error('Resolve complaint error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to resolve complaint'
      })
    }
  }

  // Get blacklist entries
  async getBlacklistEntries(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        entityType,
        status,
        reason,
        severity,
        riskScore,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (entityType) query.entityType = entityType
      if (status) query.status = status
      if (reason) query.reason = reason
      if (severity) query.severity = severity
      if (riskScore) {
        query.riskScore = { $gte: parseInt(riskScore) }
      }
      
      if (search) {
        query.$or = [
          { entryId: { $regex: search, $options: 'i' } },
          { 'identifiers.name': { $regex: search, $options: 'i' } },
          { 'identifiers.email': { $regex: search, $options: 'i' } },
          { 'identifiers.phone': { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      }

      // Execute query
      const entries = await BlacklistEntry.find(query)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await BlacklistEntry.countDocuments(query)

      return res.json({
        success: true,
        data: {
          entries,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get blacklist entries error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch blacklist entries'
      })
    }
  }

  // Create blacklist entry
  async createBlacklistEntry(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const entryData = {
        ...req.body,
        createdBy: req.admin._id
      }

      const entry = new BlacklistEntry(entryData)
      await entry.save()

      // Log the creation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'create_blacklist_entry',
        category: 'risk_management',
        description: `Created blacklist entry ${entry.entryId} for ${entry.entityType}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'blacklist_entry',
        resourceId: entry._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          entryId: entry.entryId,
          entityType: entry.entityType,
          reason: entry.reason,
          severity: entry.severity
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Blacklist entry created successfully',
        data: { entry }
      })
    } catch (error) {
      console.error('Create blacklist entry error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to create blacklist entry'
      })
    }
  }

  // Update blacklist entry
  async updateBlacklistEntry(req, res) {
    try {
      const { entryId } = req.params
      const updateData = req.body

      const entry = await BlacklistEntry.findById(entryId)
      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Blacklist entry not found'
        })
      }

      // Store original data for audit
      const originalData = entry.toObject()

      // Update entry
      Object.assign(entry, updateData)
      entry.lastModifiedBy = req.admin._id
      await entry.save()

      // Log the update
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'update_blacklist_entry',
        category: 'risk_management',
        description: `Updated blacklist entry ${entry.entryId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'blacklist_entry',
        resourceId: entry._id.toString(),
        status: 'success',
        riskLevel: 'high',
        changes: {
          before: originalData,
          after: entry.toObject()
        }
      })

      return res.json({
        success: true,
        message: 'Blacklist entry updated successfully',
        data: { entry }
      })
    } catch (error) {
      console.error('Update blacklist entry error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to update blacklist entry'
      })
    }
  }

  // Check entity against blacklist
  async checkBlacklist(req, res) {
    try {
      const { entityType, identifiers } = req.body

      const entry = await BlacklistEntry.checkEntity(entityType, identifiers)

      return res.json({
        success: true,
        data: {
          isBlacklisted: !!entry,
          entry: entry || null,
          restrictions: entry ? entry.restrictions : null
        }
      })
    } catch (error) {
      console.error('Check blacklist error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to check blacklist'
      })
    }
  }

  // Get SLA configurations
  async getSLAConfigurations(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        isActive,
        scope,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (isActive !== undefined) query.isActive = isActive === 'true'
      if (scope) query.scope = scope
      
      if (search) {
        query.$or = [
          { configId: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      }

      // Execute query
      const configs = await SLAConfig.find(query)
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await SLAConfig.countDocuments(query)

      return res.json({
        success: true,
        data: {
          configs,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get SLA configurations error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch SLA configurations'
      })
    }
  }

  // Create SLA configuration
  async createSLAConfiguration(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const configData = {
        ...req.body,
        createdBy: req.admin._id
      }

      const config = new SLAConfig(configData)
      await config.save()

      // Log the creation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'create_sla_configuration',
        category: 'risk_management',
        description: `Created SLA configuration ${config.configId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'sla_config',
        resourceId: config._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          configId: config.configId,
          name: config.name,
          scope: config.scope
        }
      })

      return res.status(201).json({
        success: true,
        message: 'SLA configuration created successfully',
        data: { config }
      })
    } catch (error) {
      console.error('Create SLA configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to create SLA configuration'
      })
    }
  }
}

module.exports = new CenterAdminRiskController()