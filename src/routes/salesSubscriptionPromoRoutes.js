const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/salesSubscriptionPromoController');
const { authenticateSalesOrSuperAdmin } = require('../middlewares/salesOrSuperAdminAuth');

router.use(authenticateSalesOrSuperAdmin);

const createValidation = [
  body('code').trim().isLength({ min: 3, max: 30 }).matches(/^[A-Z0-9-_]+$/i)
    .withMessage('Code must be 3-30 alphanumeric chars (dashes/underscores ok)'),
  body('grantsPlanId').isMongoId().withMessage('Valid plan ID required'),
  body('trialDays').isInt({ min: 1, max: 365 }).withMessage('trialDays must be 1-365'),
  body('billingCycle').optional().isIn(['monthly', 'yearly']),
  body('maxRedemptions').optional({ nullable: true }).isInt({ min: 1 }),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
];

router.get('/', ctrl.listPromos);
router.get('/:id', ctrl.getPromo);
router.post('/', createValidation, ctrl.createPromo);
router.patch('/:id', ctrl.updatePromo);
router.delete('/:id', ctrl.deactivatePromo);

module.exports = router;
