const Service = require('./src/models/Service');
const ServiceItem = require('./src/models/ServiceItem');
require('dotenv').config();

// Connect to MongoDB
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');

async function debugServiceItems() {
  try {
    console.log('🔍 Debugging Service Items...\n');
    
    // Get all services
    const services = await Service.find({ isActive: true }).select('name displayName code category');
    console.log(`📋 Available services (${services.length}):`);
    services.forEach(service => {
      console.log(`  - ${service.displayName} (${service.code}) - ${service.category}`);
    });
    
    // Check service items for each service
    console.log('\n🧪 Checking service items for each service:\n');
    
    for (const service of services) {
      const items = await ServiceItem.find({ 
        service: service.code,
        isActive: true 
      }).select('name category basePrice expressPrice description');
      
      console.log(`📦 ${service.displayName} (${service.code}):`);
      if (items.length === 0) {
        console.log('   ❌ No items found');
      } else {
        console.log(`   ✅ ${items.length} items found:`);
        items.forEach(item => {
          console.log(`     - ${item.name} (${item.category})`);
          console.log(`       Base: ₹${item.basePrice}, Express: ₹${item.expressPrice}`);
        });
      }
      console.log('');
    }
    
    // Check total service items
    const totalItems = await ServiceItem.countDocuments({ isActive: true });
    console.log(`📊 Total active service items: ${totalItems}`);
    
    if (totalItems === 0) {
      console.log('\n💡 SOLUTION: No service items exist in the system!');
      console.log('   You need to add service items for each service.');
      console.log('   Go to Admin → Services → Click "Items" button next to each service');
      console.log('   Or run the auto-create script below...\n');
      
      // Auto-create basic service items
      console.log('🔧 Auto-creating basic service items...\n');
      
      const basicItems = [
        // Wash & Fold items
        { service: 'wash_fold', name: "Men's Shirt", category: 'men', basePrice: 25, expressPrice: 35, description: 'Regular men\'s shirt' },
        { service: 'wash_fold', name: "Women's Top", category: 'women', basePrice: 30, expressPrice: 40, description: 'Women\'s casual top' },
        { service: 'wash_fold', name: "T-Shirt", category: 'unisex', basePrice: 20, expressPrice: 30, description: 'Cotton t-shirt' },
        { service: 'wash_fold', name: "Jeans", category: 'unisex', basePrice: 40, expressPrice: 55, description: 'Denim jeans' },
        { service: 'wash_fold', name: "Bedsheet", category: 'household', basePrice: 50, expressPrice: 70, description: 'Single bedsheet' },
        
        // Dry Cleaning items
        { service: 'dry_clean', name: "Men's Suit", category: 'men', basePrice: 200, expressPrice: 300, description: 'Formal suit (2-piece)' },
        { service: 'dry_clean', name: "Women's Dress", category: 'women', basePrice: 150, expressPrice: 220, description: 'Formal dress' },
        { service: 'dry_clean', name: "Blazer", category: 'unisex', basePrice: 120, expressPrice: 180, description: 'Formal blazer' },
        { service: 'dry_clean', name: "Coat", category: 'unisex', basePrice: 180, expressPrice: 250, description: 'Winter coat' },
        
        // Steam Press items
        { service: 'steam_press', name: "Formal Shirt", category: 'men', basePrice: 15, expressPrice: 25, description: 'Formal dress shirt' },
        { service: 'steam_press', name: "Trousers", category: 'unisex', basePrice: 20, expressPrice: 30, description: 'Formal trousers' },
        { service: 'steam_press', name: "Saree", category: 'women', basePrice: 35, expressPrice: 50, description: 'Traditional saree' },
        
        // Wash & Iron items
        { service: 'wash_iron', name: "Casual Shirt", category: 'men', basePrice: 35, expressPrice: 50, description: 'Casual shirt with ironing' },
        { service: 'wash_iron', name: "Kurta", category: 'unisex', basePrice: 40, expressPrice: 60, description: 'Traditional kurta' },
        
        // Premium Laundry items
        { service: 'premium_laundry', name: "Designer Shirt", category: 'men', basePrice: 80, expressPrice: 120, description: 'Premium designer shirt' },
        { service: 'premium_laundry', name: "Silk Dress", category: 'women', basePrice: 100, expressPrice: 150, description: 'Delicate silk dress' },
      ];
      
      for (const itemData of basicItems) {
        try {
          const item = new ServiceItem({
            ...itemData,
            isActive: true,
            sortOrder: 0
          });
          await item.save();
          console.log(`   ✅ Created: ${itemData.name} for ${itemData.service}`);
        } catch (error) {
          if (error.code === 11000) {
            console.log(`   ⚠️  Already exists: ${itemData.name} for ${itemData.service}`);
          } else {
            console.log(`   ❌ Error creating ${itemData.name}:`, error.message);
          }
        }
      }
      
      console.log('\n🎉 Basic service items have been created!');
      console.log('   Try the booking flow again - items should now appear.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugServiceItems();