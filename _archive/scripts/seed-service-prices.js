require('dotenv').config()
const mongoose = require('mongoose')
const ServicePrice = require('./src/models/ServicePrice')

const initialPrices = [
  // Men
  { category: 'men', garment: 'Shirt', dryClean: 80, steamPress: 20, starch: 15, alteration: 100, sortOrder: 1 },
  { category: 'men', garment: 'T-Shirt', dryClean: 60, steamPress: 15, starch: 10, alteration: 80, sortOrder: 2 },
  { category: 'men', garment: 'Trouser', dryClean: 90, steamPress: 25, starch: 20, alteration: 120, sortOrder: 3 },
  { category: 'men', garment: 'Jeans', dryClean: 100, steamPress: 30, starch: 0, alteration: 150, sortOrder: 4 },
  { category: 'men', garment: 'Suit (2pc)', dryClean: 350, steamPress: 80, starch: 40, alteration: 300, sortOrder: 5 },
  { category: 'men', garment: 'Suit (3pc)', dryClean: 450, steamPress: 100, starch: 50, alteration: 400, sortOrder: 6 },
  { category: 'men', garment: 'Blazer', dryClean: 250, steamPress: 60, starch: 30, alteration: 200, sortOrder: 7 },
  { category: 'men', garment: 'Jacket', dryClean: 300, steamPress: 70, starch: 35, alteration: 250, sortOrder: 8 },
  { category: 'men', garment: 'Kurta', dryClean: 100, steamPress: 25, starch: 20, alteration: 100, sortOrder: 9 },
  { category: 'men', garment: 'Sherwani', dryClean: 500, steamPress: 120, starch: 60, alteration: 400, sortOrder: 10 },
  
  // Women
  { category: 'women', garment: 'Blouse', dryClean: 80, steamPress: 20, starch: 15, alteration: 100, sortOrder: 1 },
  { category: 'women', garment: 'Top', dryClean: 70, steamPress: 18, starch: 12, alteration: 80, sortOrder: 2 },
  { category: 'women', garment: 'Kurti', dryClean: 100, steamPress: 25, starch: 20, alteration: 100, sortOrder: 3 },
  { category: 'women', garment: 'Saree', dryClean: 200, steamPress: 50, starch: 40, alteration: 150, sortOrder: 4 },
  { category: 'women', garment: 'Saree (Silk)', dryClean: 350, steamPress: 80, starch: 60, alteration: 200, sortOrder: 5 },
  { category: 'women', garment: 'Salwar Suit', dryClean: 180, steamPress: 45, starch: 35, alteration: 150, sortOrder: 6 },
  { category: 'women', garment: 'Lehenga', dryClean: 600, steamPress: 150, starch: 80, alteration: 500, sortOrder: 7 },
  { category: 'women', garment: 'Gown', dryClean: 400, steamPress: 100, starch: 50, alteration: 350, sortOrder: 8 },
  { category: 'women', garment: 'Dress', dryClean: 150, steamPress: 40, starch: 25, alteration: 120, sortOrder: 9 },
  { category: 'women', garment: 'Skirt', dryClean: 100, steamPress: 25, starch: 20, alteration: 100, sortOrder: 10 },
  
  // Kids
  { category: 'kids', garment: 'Shirt', dryClean: 50, steamPress: 12, starch: 10, alteration: 60, sortOrder: 1 },
  { category: 'kids', garment: 'T-Shirt', dryClean: 40, steamPress: 10, starch: 8, alteration: 50, sortOrder: 2 },
  { category: 'kids', garment: 'Trouser', dryClean: 60, steamPress: 15, starch: 12, alteration: 70, sortOrder: 3 },
  { category: 'kids', garment: 'Jeans', dryClean: 70, steamPress: 18, starch: 0, alteration: 80, sortOrder: 4 },
  { category: 'kids', garment: 'Frock', dryClean: 80, steamPress: 20, starch: 15, alteration: 80, sortOrder: 5 },
  { category: 'kids', garment: 'School Uniform', dryClean: 60, steamPress: 15, starch: 12, alteration: 70, sortOrder: 6 },
  
  // Household
  { category: 'household', garment: 'Bedsheet (Single)', dryClean: 150, steamPress: 40, starch: 30, alteration: 0, sortOrder: 1 },
  { category: 'household', garment: 'Bedsheet (Double)', dryClean: 200, steamPress: 50, starch: 40, alteration: 0, sortOrder: 2 },
  { category: 'household', garment: 'Blanket', dryClean: 300, steamPress: 0, starch: 0, alteration: 0, sortOrder: 3 },
  { category: 'household', garment: 'Curtain (per panel)', dryClean: 150, steamPress: 40, starch: 30, alteration: 100, sortOrder: 4 },
  { category: 'household', garment: 'Pillow Cover', dryClean: 50, steamPress: 15, starch: 10, alteration: 0, sortOrder: 5 },
  { category: 'household', garment: 'Sofa Cover', dryClean: 250, steamPress: 60, starch: 40, alteration: 150, sortOrder: 6 },
  { category: 'household', garment: 'Table Cloth', dryClean: 100, steamPress: 30, starch: 25, alteration: 0, sortOrder: 7 },
  
  // Institutional
  { category: 'institutional', garment: 'Hotel Bedsheet', dryClean: 120, steamPress: 35, starch: 25, alteration: 0, sortOrder: 1 },
  { category: 'institutional', garment: 'Hotel Towel', dryClean: 50, steamPress: 0, starch: 0, alteration: 0, sortOrder: 2 },
  { category: 'institutional', garment: 'Restaurant Napkin', dryClean: 30, steamPress: 10, starch: 8, alteration: 0, sortOrder: 3 },
  { category: 'institutional', garment: 'Uniform (per piece)', dryClean: 80, steamPress: 20, starch: 15, alteration: 80, sortOrder: 4 },
  { category: 'institutional', garment: 'Apron', dryClean: 60, steamPress: 15, starch: 12, alteration: 50, sortOrder: 5 },
  
  // Others
  { category: 'others', garment: 'Tie', dryClean: 50, steamPress: 15, starch: 0, alteration: 0, sortOrder: 1 },
  { category: 'others', garment: 'Scarf', dryClean: 80, steamPress: 20, starch: 0, alteration: 0, sortOrder: 2 },
  { category: 'others', garment: 'Cap/Hat', dryClean: 60, steamPress: 0, starch: 0, alteration: 0, sortOrder: 3 },
  { category: 'others', garment: 'Bag (Fabric)', dryClean: 150, steamPress: 0, starch: 0, alteration: 100, sortOrder: 4 },
  { category: 'others', garment: 'Soft Toy', dryClean: 100, steamPress: 0, starch: 0, alteration: 0, sortOrder: 5 },
  { category: 'others', garment: 'Shoes (per pair)', dryClean: 200, steamPress: 0, starch: 0, alteration: 0, sortOrder: 6 }
]

async function seedPrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')
    
    // Clear existing prices
    await ServicePrice.deleteMany({})
    console.log('Cleared existing prices')
    
    // Insert new prices
    await ServicePrice.insertMany(initialPrices)
    console.log(`✅ Inserted ${initialPrices.length} service prices`)
    
    console.log('\nCategories:')
    const categories = ['men', 'women', 'kids', 'household', 'institutional', 'others']
    for (const cat of categories) {
      const count = initialPrices.filter(p => p.category === cat).length
      console.log(`  - ${cat}: ${count} items`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

seedPrices()
