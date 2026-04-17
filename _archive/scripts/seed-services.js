require('dotenv').config()
const mongoose = require('mongoose')
const Service = require('./src/models/Service')

const defaultServices = [
  {
    name: 'Wash & Fold',
    code: 'wash_fold',
    displayName: 'Wash & Fold',
    description: 'Regular washing and folding service for everyday clothes',
    icon: 'Shirt',
    category: 'laundry',
    basePriceMultiplier: 1.0,
    turnaroundTime: { standard: 48, express: 24 },
    isExpressAvailable: true,
    sortOrder: 1
  },
  {
    name: 'Wash & Iron',
    code: 'wash_iron',
    displayName: 'Wash & Iron',
    description: 'Complete laundry service with washing and ironing',
    icon: 'Sparkles',
    category: 'laundry',
    basePriceMultiplier: 1.0,
    turnaroundTime: { standard: 48, express: 24 },
    isExpressAvailable: true,
    sortOrder: 2
  },
  {
    name: 'Dry Clean',
    code: 'dry_clean',
    displayName: 'Dry Cleaning',
    description: 'Professional dry cleaning for delicate and formal wear',
    icon: 'Award',
    category: 'dry_cleaning',
    basePriceMultiplier: 1.0,
    turnaroundTime: { standard: 72, express: 48 },
    isExpressAvailable: true,
    sortOrder: 3
  },
  {
    name: 'Steam Press',
    code: 'steam_press',
    displayName: 'Steam Press',
    description: 'Professional steam pressing for wrinkle-free clothes',
    icon: 'Zap',
    category: 'pressing',
    basePriceMultiplier: 1.0,
    turnaroundTime: { standard: 24, express: 12 },
    isExpressAvailable: true,
    sortOrder: 4
  },
  {
    name: 'Starching',
    code: 'starching',
    displayName: 'Starching',
    description: 'Professional starching service for crisp finish',
    icon: 'Star',
    category: 'specialty',
    basePriceMultiplier: 1.0,
    turnaroundTime: { standard: 48, express: 24 },
    isExpressAvailable: true,
    sortOrder: 5
  },
  {
    name: 'Premium Laundry',
    code: 'premium_laundry',
    displayName: 'Premium Laundry',
    description: 'Premium laundry service with extra care and attention',
    icon: 'Crown',
    category: 'laundry',
    basePriceMultiplier: 1.5,
    turnaroundTime: { standard: 48, express: 24 },
    isExpressAvailable: true,
    sortOrder: 6
  },
  {
    name: 'Premium Dry Clean',
    code: 'premium_dry_clean',
    displayName: 'Premium Dry Cleaning',
    description: 'Premium dry cleaning with special fabric care',
    icon: 'Diamond',
    category: 'dry_cleaning',
    basePriceMultiplier: 1.5,
    turnaroundTime: { standard: 72, express: 48 },
    isExpressAvailable: true,
    sortOrder: 7
  },
  {
    name: 'Premium Steam Press',
    code: 'premium_steam_press',
    displayName: 'Premium Steam Press',
    description: 'Premium steam pressing with extra attention to detail',
    icon: 'Flame',
    category: 'pressing',
    basePriceMultiplier: 1.5,
    turnaroundTime: { standard: 24, express: 12 },
    isExpressAvailable: true,
    sortOrder: 8
  },
  {
    name: 'Alteration',
    code: 'alteration',
    displayName: 'Alteration & Repair',
    description: 'Professional alteration and repair services',
    icon: 'Scissors',
    category: 'specialty',
    basePriceMultiplier: 1.0,
    turnaroundTime: { standard: 72, express: 48 },
    isExpressAvailable: false,
    sortOrder: 9
  }
]

async function seedServices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    // Clear existing services
    await Service.deleteMany({})
    console.log('Cleared existing services')

    // Insert default services
    const services = await Service.insertMany(defaultServices)
    console.log(`Created ${services.length} services:`)
    services.forEach(s => console.log(`  - ${s.displayName} (${s.code})`))

    console.log('\n✅ Services seeded successfully!')
    process.exit(0)
  } catch (error) {
    console.error('Error seeding services:', error)
    process.exit(1)
  }
}

seedServices()
