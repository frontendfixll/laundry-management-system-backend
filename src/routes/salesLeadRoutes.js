const express = require('express');
const router = express.Router();
const salesLeadController = require('../controllers/salesLeadController');
const { authenticateSalesOrSuperAdmin, requireSalesOrSuperAdminPermission, logSalesOrSuperAdminAction } = require('../middlewares/salesOrSuperAdminAuth');
const { body, param } = require('express-validator');

// Validation rules
const validateLeadCreation = [
  body('businessName').trim().isLength({ min: 2 }).withMessage('Business name is required'),
  body('contactPerson.name').trim().isLength({ min: 2 }).withMessage('Contact person name is required'),
  body('contactPerson.email').isEmail().withMessage('Valid email is required'),
  body('contactPerson.phone').trim().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit phone number required'),
  body('businessType').optional().isIn(['laundry', 'dry_cleaning', 'hotel', 'hospital', 'other']),
  body('source').optional().isIn(['website', 'referral', 'cold_call', 'email_campaign', 'social_media', 'event', 'partner', 'other'])
];

const validateLeadUpdate = [
  body('businessName').optional().trim().isLength({ min: 2 }),
  body('contactPerson.email').optional().isEmail(),
  body('contactPerson.phone').optional().trim().matches(/^[6-9]\d{9}$/)
];

const validateFollowUp = [
  body('note').trim().isLength({ min: 5 }).withMessage('Follow-up note must be at least 5 characters'),
  body('nextFollowUp').optional().isISO8601().withMessage('Valid date required for next follow-up')
];

const validateTrialExtension = [
  body('extensionDays').optional().isInt({ min: 1, max: 30 }).withMessage('Extension days must be between 1 and 30')
];

const validateConversion = [
  body('tenancyId').isMongoId().withMessage('Valid tenancy ID required')
];

const validateMarkLost = [
  body('reason').isIn(['price_too_high', 'competitor', 'not_interested', 'timing', 'features_missing', 'other']),
  body('notes').optional().trim()
];

// All routes require sales or superadmin authentication
router.use(authenticateSalesOrSuperAdmin);

// Get lead statistics
router.get('/stats',
  requireSalesOrSuperAdminPermission('leads', 'view'),
  logSalesOrSuperAdminAction('view_lead_stats', 'leads'),
  salesLeadController.getLeadStats
);

// Get expiring leads
router.get('/expiring-soon',
  requireSalesOrSuperAdminPermission('trials', 'view'),
  logSalesOrSuperAdminAction('view_expiring_leads', 'leads'),
  salesLeadController.getExpiringLeads
);

// Get all leads
router.get('/',
  requireSalesOrSuperAdminPermission('leads', 'view'),
  logSalesOrSuperAdminAction('view_leads', 'leads'),
  salesLeadController.getLeads
);

// Get single lead
router.get('/:id',
  requireSalesOrSuperAdminPermission('leads', 'view'),
  logSalesOrSuperAdminAction('view_lead', 'leads'),
  salesLeadController.getLead
);

// Create lead
router.post('/',
  requireSalesOrSuperAdminPermission('leads', 'create'),
  validateLeadCreation,
  logSalesOrSuperAdminAction('create_lead', 'leads'),
  salesLeadController.createLead
);

// Update lead
router.put('/:id',
  requireSalesOrSuperAdminPermission('leads', 'update'),
  validateLeadUpdate,
  logSalesOrSuperAdminAction('update_lead', 'leads'),
  salesLeadController.updateLead
);

// Delete lead
router.delete('/:id',
  requireSalesOrSuperAdminPermission('leads', 'delete'),
  logSalesOrSuperAdminAction('delete_lead', 'leads'),
  salesLeadController.deleteLead
);

// Assign lead
router.post('/:id/assign',
  requireSalesOrSuperAdminPermission('leads', 'update'),
  body('salesUserId').isMongoId().withMessage('Valid sales user ID required'),
  logSalesOrSuperAdminAction('assign_lead', 'leads'),
  salesLeadController.assignLead
);

// Add follow-up note
router.post('/:id/follow-up',
  requireSalesOrSuperAdminPermission('leads', 'update'),
  validateFollowUp,
  logSalesOrSuperAdminAction('add_follow_up', 'leads'),
  salesLeadController.addFollowUpNote
);

// Start trial
router.post('/:id/start-trial',
  requireSalesOrSuperAdminPermission('trials', 'extend'),
  body('trialDays').optional().isInt({ min: 1, max: 90 }).withMessage('Trial days must be between 1 and 90'),
  logSalesOrSuperAdminAction('start_trial', 'trials'),
  salesLeadController.startTrial
);

// Extend trial
router.post('/:id/extend-trial',
  requireSalesOrSuperAdminPermission('trials', 'extend'),
  validateTrialExtension,
  logSalesOrSuperAdminAction('extend_trial', 'trials'),
  salesLeadController.extendTrial
);

// Convert lead
router.post('/:id/convert',
  requireSalesOrSuperAdminPermission('trials', 'convert'),
  validateConversion,
  logSalesOrSuperAdminAction('convert_lead', 'leads'),
  salesLeadController.convertLead
);

// Mark lead as lost
router.post('/:id/mark-lost',
  requireSalesOrSuperAdminPermission('leads', 'update'),
  validateMarkLost,
  logSalesOrSuperAdminAction('mark_lead_lost', 'leads'),
  salesLeadController.markLeadAsLost
);

module.exports = router;
