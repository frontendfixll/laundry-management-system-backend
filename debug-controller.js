const CenterAdminAuthController = require('./src/controllers/centerAdminAuthController')

console.log('Controller type:', typeof CenterAdminAuthController)
console.log('Controller methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(CenterAdminAuthController)))
console.log('Has completeLogin:', typeof CenterAdminAuthController.completeLogin)

// Test if the method exists
if (CenterAdminAuthController.completeLogin) {
  console.log('✅ completeLogin method exists')
} else {
  console.log('❌ completeLogin method missing')
}

// Check the constructor
console.log('Constructor:', CenterAdminAuthController.constructor.name)