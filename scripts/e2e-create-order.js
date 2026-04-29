// Throwaway script for the cross-tenant security test.
// Inserts a minimal valid Order doc into the given tenancy with status=PLACED
// so the assignOrderToBranch endpoint has something to find. Run with:
//   node scripts/e2e-create-order.js <tenancyId> <userId>
require('dotenv').config()
const mongoose = require('mongoose')
const Order = require('../src/models/Order')

async function main() {
  const [, , tenancyId, userId] = process.argv
  if (!tenancyId || !userId) {
    console.error('Usage: node scripts/e2e-create-order.js <tenancyId> <userId>')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('connected')

  const order = await Order.create({
    orderNumber: `E2E-${Date.now()}`,
    customer: userId,
    tenancy: tenancyId,
    status: 'placed',
    pricing: { subtotal: 100, tax: 0, deliveryCharge: 0, total: 100 },
    items: [],
    pickupAddress: {
      addressLine1: 'E2E test',
      city: 'Mumbai',
      pincode: '400001',
      phone: '9999990001',
    },
    deliveryAddress: {
      addressLine1: 'E2E test',
      city: 'Mumbai',
      pincode: '400001',
      phone: '9999990001',
    },
    pickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    pickupTimeSlot: '09:00-11:00',
    paymentMethod: 'cod',
    isExpress: false,
  })

  console.log('orderId:', order._id.toString())
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
