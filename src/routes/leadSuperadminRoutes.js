const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');
const { 
  getLeads, 
  getLeadById, 
  updateLead, 
  deleteLead, 
  getLeadStats 
} = require('../controllers/leadController');
const { LEAD_STATUS } = require('../models/Lead');

// Validation middleware
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Validation rules
const validateGetLeads = [
  query('status')
    .optional()
    .isIn(Object.values(LEAD_STATUS))
    .withMessage('Invalid status. Must be: new, contacted, converted, or closed'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const validateLeadId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid lead ID')
];

const validateUpdateLead = [
  param('id')
    .isMongoId()
    .withMessage('Invalid lead ID'),
  body('status')
    .optional()
    .isIn(Object.values(LEAD_STATUS))
    .withMessage('Invalid status. Must be: new, contacted, converted, or closed'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes must not exceed 2000 characters'),
  body('convertedToTenancy')
    .optional()
    .isMongoId()
    .withMessage('Invalid tenancy ID')
];

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// GET /api/superadmin/leads/stats - Get lead statistics (must be before /:id)
router.get('/stats', getLeadStats);

// GET /api/superadmin/leads - List all leads with filtering and pagination
router.get('/', validateGetLeads, handleValidation, getLeads);

// GET /api/superadmin/leads/:id - Get lead by ID
router.get('/:id', validateLeadId, handleValidation, getLeadById);

// PATCH /api/superadmin/leads/:id - Update lead status/notes
router.patch('/:id', validateUpdateLead, handleValidation, updateLead);

// DELETE /api/superadmin/leads/:id - Delete lead
router.delete('/:id', validateLeadId, handleValidation, deleteLead);

module.exports = router;
