// Throwaway cleanup script. Removes the E2E test tenants + every doc that
// references them via the `tenancy` field. Run after the cross-tenant
// security verification:
//   node scripts/e2e-cleanup.js
require('dotenv').config()
const mongoose = require('mongoose')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('connected')

  const Tenancy = require('../src/models/Tenancy')
  const tenants = await Tenancy.find({
    slug: { $in: ['e2e-sec-test-a', 'e2e-sec-test-b'] }
  }).select('_id slug')

  if (tenants.length === 0) {
    console.log('No E2E test tenants found.')
    await mongoose.disconnect()
    return
  }

  const ids = tenants.map(t => t._id)
  console.log('Deleting tenants:', tenants.map(t => `${t.slug} (${t._id})`).join(', '))

  // Wipe everything that points at these tenancies. Don't worry about
  // collections that aren't there — Mongoose just no-ops if model unknown.
  const collections = [
    'Order', 'Branch', 'User', 'Customer', 'Address', 'Notification',
    'Wallet', 'LoyaltyTransaction', 'Banner', 'Coupon', 'Discount',
    'Campaign', 'Service', 'Settings', 'StaffType', 'Lead', 'Subscription',
    'OrderItem', 'Refund', 'Ticket',
  ]

  for (const name of collections) {
    try {
      const Model = require(`../src/models/${name}`)
      const r = await Model.deleteMany({ tenancy: { $in: ids } })
      if (r.deletedCount > 0) {
        console.log(`  - ${name}: deleted ${r.deletedCount}`)
      }
    } catch (err) {
      // Model not found, skip
    }
  }

  await Tenancy.deleteMany({ _id: { $in: ids } })
  console.log(`Deleted ${tenants.length} tenant(s)`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
