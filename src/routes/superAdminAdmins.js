const express = require('express')
const router = express.Router()
const superAdminAdminsController = require('../controllers/superAdminAdminsController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')

// All routes require authentication
router.use(authenticateSuperAdmin)

// Get all admins
router.get('/', superAdminAdminsController.getAllAdmins)

// Create new admin
router.post('/', superAdminAdminsController.createAdmin)

// Invitation routes (MUST be before /:adminId to avoid route conflicts)
router.post('/invite', superAdminAdminsController.inviteAdmin)
router.get('/invitations', superAdminAdminsController.getInvitations)
router.post('/invitations/:invitationId/resend', superAdminAdminsController.resendInvitation)
router.delete('/invitations/:invitationId', superAdminAdminsController.cancelInvitation)

// Get admin by ID
router.get('/:adminId', superAdminAdminsController.getAdminById)

// Update admin permissions
router.put('/:adminId/permissions', superAdminAdminsController.updatePermissions)

// Deactivate admin (soft delete)
router.delete('/:adminId', superAdminAdminsController.deactivateAdmin)

// Reactivate admin
router.put('/:adminId/reactivate', superAdminAdminsController.reactivateAdmin)

module.exports = router
