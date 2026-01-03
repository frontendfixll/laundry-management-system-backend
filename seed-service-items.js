require('dotenv').config()
const mongoose = require('mongoose')
const ServiceItem = require('./src/models/ServiceItem')

const initialItems = [
  // Wash & Fold
  { itemId: 'mens_shirt', name: "Men's Shirt", service: 'wash_fold', category: 'men', basePrice: 25 },
  { itemId: 'womens_shirt', name: "Women's Shirt", service: 'wash_fold', category: 'women', basePrice: 25 },
  { itemId: 'tshirt', name: 'T-Shirt', service: 'wash_fold', category: 'men', basePrice: 20 },
  { itemId: 'trousers', name: 'Trousers/Pants', service: 'wash_fold', category: 'men', basePrice: 30 },
  { itemId: 'jeans', name: 'Jeans', service: 'wash_fold', category: 'men', basePrice: 35 },
  { itemId: 'bedsheet_single', name: 'Bed Sheet (Single)', service: 'wash_fold', category: 'household', basePrice: 40 },
  { itemId: 'bedsheet_double', name: 'Bed Sheet (Double)', service: 'wash_fold', category: 'household', basePrice: 60 },
  { itemId: 'towel', name: 'Towel', service: 'wash_fold', category: 'household', basePrice: 20 },
  { itemId: 'pillow_cover', name: 'Pillow Cover', service: 'wash_fold', category: 'household', basePrice: 15 },

  // Wash & Iron
  { itemId: 'mens_shirt_iron', name: "Men's Shirt", service: 'wash_iron', category: 'men', basePrice: 35 },
  { itemId: 'womens_shirt_iron', name: "Women's Shirt", service: 'wash_iron', category: 'women', basePrice: 35 },
  { itemId: 'tshirt_iron', name: 'T-Shirt', service: 'wash_iron', category: 'men', basePrice: 25 },
  { itemId: 'trousers_iron', name: 'Trousers/Pants', service: 'wash_iron', category: 'men', basePrice: 40 },
  { itemId: 'jeans_iron', name: 'Jeans', service: 'wash_iron', category: 'men', basePrice: 45 },
  { itemId: 'dress_iron', name: 'Dress', service: 'wash_iron', category: 'women', basePrice: 50 },
  { itemId: 'kurti_iron', name: 'Kurti', service: 'wash_iron', category: 'women', basePrice: 40 },

  // Premium Laundry
  { itemId: 'silk_shirt', name: 'Silk Shirt', service: 'premium_laundry', category: 'men', basePrice: 80 },
  { itemId: 'silk_saree', name: 'Silk Saree', service: 'premium_laundry', category: 'women', basePrice: 150 },
  { itemId: 'woolen_sweater', name: 'Woolen Sweater', service: 'premium_laundry', category: 'men', basePrice: 100 },
  { itemId: 'cashmere', name: 'Cashmere Item', service: 'premium_laundry', category: 'others', basePrice: 200 },
  { itemId: 'linen_shirt', name: 'Linen Shirt', service: 'premium_laundry', category: 'men', basePrice: 70 },
  { itemId: 'designer_dress', name: 'Designer Dress', service: 'premium_laundry', category: 'women', basePrice: 180 },

  // Dry Clean
  { itemId: 'formal_shirt', name: 'Formal Shirt', service: 'dry_clean', category: 'men', basePrice: 60 },
  { itemId: 'suit_2piece', name: 'Suit (2-piece)', service: 'dry_clean', category: 'men', basePrice: 250 },
  { itemId: 'blazer', name: 'Blazer/Jacket', service: 'dry_clean', category: 'men', basePrice: 180 },
  { itemId: 'saree_cotton', name: 'Saree (Cotton)', service: 'dry_clean', category: 'women', basePrice: 100 },
  { itemId: 'saree_silk', name: 'Saree (Silk)', service: 'dry_clean', category: 'women', basePrice: 150 },
  { itemId: 'dress_gown', name: 'Dress/Gown', service: 'dry_clean', category: 'women', basePrice: 120 },
  { itemId: 'curtains', name: 'Curtains (per panel)', service: 'dry_clean', category: 'household', basePrice: 200 },
  { itemId: 'coat', name: 'Coat/Overcoat', service: 'dry_clean', category: 'men', basePrice: 220 },

  // Steam Press
  { itemId: 'shirt_press', name: 'Shirt', service: 'steam_press', category: 'men', basePrice: 15 },
  { itemId: 'trousers_press', name: 'Trousers', service: 'steam_press', category: 'men', basePrice: 20 },
  { itemId: 'saree_press', name: 'Saree', service: 'steam_press', category: 'women', basePrice: 40 },
  { itemId: 'suit_press', name: 'Suit (2-piece)', service: 'steam_press', category: 'men', basePrice: 60 },
  { itemId: 'dress_press', name: 'Dress', service: 'steam_press', category: 'women', basePrice: 30 },
  { itemId: 'kurti_press', name: 'Kurti', service: 'steam_press', category: 'women', basePrice: 20 },

  // Starching
  { itemId: 'cotton_shirt_starch', name: 'Cotton Shirt', service: 'starching', category: 'men', basePrice: 25 },
  { itemId: 'cotton_saree_starch', name: 'Cotton Saree', service: 'starching', category: 'women', basePrice: 50 },
  { itemId: 'dhoti_starch', name: 'Dhoti', service: 'starching', category: 'men', basePrice: 30 },
  { itemId: 'kurta_starch', name: 'Kurta', service: 'starching', category: 'men', basePrice: 30 },
  { itemId: 'bedsheet_starch', name: 'Bed Sheet', service: 'starching', category: 'household', basePrice: 45 },

  // Premium Steam Press
  { itemId: 'silk_saree_press', name: 'Silk Saree', service: 'premium_steam_press', category: 'women', basePrice: 80 },
  { itemId: 'designer_suit_press', name: 'Designer Suit', service: 'premium_steam_press', category: 'men', basePrice: 100 },
  { itemId: 'lehenga_press', name: 'Lehenga', service: 'premium_steam_press', category: 'women', basePrice: 150 },
  { itemId: 'sherwani_press', name: 'Sherwani', service: 'premium_steam_press', category: 'men', basePrice: 120 },
  { itemId: 'wedding_dress_press', name: 'Wedding Dress', service: 'premium_steam_press', category: 'women', basePrice: 200 },

  // Premium Dry Clean
  { itemId: 'designer_suit', name: 'Designer Suit', service: 'premium_dry_clean', category: 'men', basePrice: 400 },
  { itemId: 'bridal_lehenga', name: 'Bridal Lehenga', service: 'premium_dry_clean', category: 'women', basePrice: 800 },
  { itemId: 'sherwani', name: 'Sherwani', service: 'premium_dry_clean', category: 'men', basePrice: 500 },
  { itemId: 'designer_saree', name: 'Designer Saree', service: 'premium_dry_clean', category: 'women', basePrice: 350 },
  { itemId: 'luxury_coat', name: 'Luxury Coat', service: 'premium_dry_clean', category: 'men', basePrice: 450 },
  { itemId: 'evening_gown', name: 'Evening Gown', service: 'premium_dry_clean', category: 'women', basePrice: 400 },
]

async function seedItems() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')
    
    // Clear existing items
    await ServiceItem.deleteMany({})
    console.log('Cleared existing items')
    
    // Insert new items
    await ServiceItem.insertMany(initialItems)
    console.log(`✅ Inserted ${initialItems.length} service items`)
    
    // Count by service
    const services = ['wash_fold', 'wash_iron', 'premium_laundry', 'dry_clean', 'steam_press', 'starching', 'premium_steam_press', 'premium_dry_clean']
    console.log('\nItems by service:')
    for (const service of services) {
      const count = initialItems.filter(i => i.service === service).length
      console.log(`  - ${service}: ${count} items`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

seedItems()
