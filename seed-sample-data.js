require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Order = require('./src/models/Order');
const Branch = require('./src/models/Branch');
const { hashPassword } = require('./src/utils/password');

async function seedSampleData() {
  try {
    console.log('🌱 Seeding sample data for dynamic homepage...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create sample branches in different cities
    const branches = [
      {
        name: 'LaundryPro Delhi Central',
        code: 'DEL001',
        address: {
          addressLine1: 'Connaught Place',
          city: 'Delhi',
          pincode: '110001'
        },
        contact: { phone: '9876543210' },
        isActive: true
      },
      {
        name: 'LaundryPro Mumbai Bandra',
        code: 'MUM001',
        address: {
          addressLine1: 'Bandra West',
          city: 'Mumbai',
          pincode: '400050'
        },
        contact: { phone: '9876543211' },
        isActive: true
      },
      {
        name: 'LaundryPro Bangalore Koramangala',
        code: 'BLR001',
        address: {
          addressLine1: 'Koramangala 4th Block',
          city: 'Bangalore',
          pincode: '560034'
        },
        contact: { phone: '9876543212' },
        isActive: true
      },
      {
        name: 'LaundryPro Chennai T Nagar',
        code: 'CHE001',
        address: {
          addressLine1: 'T Nagar',
          city: 'Chennai',
          pincode: '600017'
        },
        contact: { phone: '9876543213' },
        isActive: true
      },
      {
        name: 'LaundryPro Hyderabad Hitech City',
        code: 'HYD001',
        address: {
          addressLine1: 'Hitech City',
          city: 'Hyderabad',
          pincode: '500081'
        },
        contact: { phone: '9876543214' },
        isActive: true
      }
    ];

    // Clear existing sample data
    await Branch.deleteMany({ code: { $in: branches.map(b => b.code) } });
    
    // Insert branches
    const createdBranches = await Branch.insertMany(branches);
    console.log(`✅ Created ${createdBranches.length} branches`);

    // Create sample customers
    const customers = [];
    const hashedPassword = await hashPassword('password123');
    
    for (let i = 1; i <= 50; i++) {
      customers.push({
        name: `Customer ${i}`,
        email: `customer${i}@example.com`,
        phone: `987654${String(i).padStart(4, '0')}`,
        password: hashedPassword,
        role: 'customer',
        isActive: true,
        isEmailVerified: true,
        isVIP: i <= 5, // First 5 are VIP
        totalOrders: Math.floor(Math.random() * 20),
        rewardPoints: Math.floor(Math.random() * 500),
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000) // Random date in last 90 days
      });
    }

    // Clear existing sample customers
    await User.deleteMany({ email: { $regex: /^customer\d+@example\.com$/ } });
    
    // Insert customers
    const createdCustomers = await User.insertMany(customers);
    console.log(`✅ Created ${createdCustomers.length} customers`);

    // Create sample orders with proper structure
    const orders = [];
    const orderStatuses = ['placed', 'picked', 'in_process', 'ready', 'out_for_delivery', 'delivered'];
    
    for (let i = 1; i <= 100; i++) {
      const customer = createdCustomers[Math.floor(Math.random() * createdCustomers.length)];
      const branch = createdBranches[Math.floor(Math.random() * createdBranches.length)];
      const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      
      const subtotal = Math.floor(Math.random() * 500) + 100; // 100-600
      const tax = Math.floor(subtotal * 0.18); // 18% tax
      const total = subtotal + tax;

      orders.push({
        orderNumber: `ORD${String(i).padStart(6, '0')}`,
        customer: customer._id,
        branch: branch._id,
        pickupAddress: {
          name: customer.name,
          phone: customer.phone,
          addressLine1: `Address ${i}`,
          city: branch.address.city,
          pincode: branch.address.pincode
        },
        deliveryAddress: {
          name: customer.name,
          phone: customer.phone,
          addressLine1: `Address ${i}`,
          city: branch.address.city,
          pincode: branch.address.pincode
        },
        pickupDate: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000), // Next 7 days
        pickupTimeSlot: '10:00-12:00',
        items: [], // Will be empty for now, just for stats
        pricing: {
          subtotal,
          tax,
          total
        },
        totalAmount: total, // Add this field for stats calculations
        paymentMethod: Math.random() > 0.5 ? 'online' : 'cod',
        paymentStatus: status === 'delivered' ? 'paid' : 'pending',
        status,
        rating: status === 'delivered' ? {
          score: Math.floor(Math.random() * 2) + 4, // 4-5 stars
          ratedAt: new Date()
        } : undefined,
        createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000), // Random date in last 60 days
        updatedAt: new Date()
      });
    }

    // Clear existing sample orders
    await Order.deleteMany({ orderNumber: { $regex: /^ORD\d{6}$/ } });
    
    // Insert orders
    const createdOrders = await Order.insertMany(orders);
    console.log(`✅ Created ${createdOrders.length} orders`);

    console.log('\n🎉 Sample data seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Branches: ${createdBranches.length} (in ${branches.length} cities)`);
    console.log(`- Customers: ${createdCustomers.length} (${customers.filter(c => c.isVIP).length} VIP)`);
    console.log(`- Orders: ${createdOrders.length} (various statuses)`);
    console.log('\n🚀 Homepage will now show dynamic statistics!');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

seedSampleData();