const mongoose = require('mongoose');
const { TenancyPayment } = require('./src/models/TenancyBilling');
const Tenancy = require('./src/models/Tenancy');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/laundry-management', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createSamplePayments() {
  try {
    console.log('🔍 Finding tenancies...');
    
    // Get existing tenancies
    const tenancies = await Tenancy.find().limit(5);
    
    if (tenancies.length === 0) {
      console.log('❌ No tenancies found. Please create some tenancies first.');
      return;
    }

    console.log(`✅ Found ${tenancies.length} tenancies`);

    // Clear existing sample payments
    await TenancyPayment.deleteMany({ 
      'metadata.isSample': true 
    });

    const samplePayments = [];
    const paymentMethods = ['bank_transfer', 'upi', 'card', 'wallet', 'manual'];
    const statuses = ['completed', 'pending', 'failed'];

    // Create 15 sample payments
    for (let i = 0; i < 15; i++) {
      const tenancy = tenancies[Math.floor(Math.random() * tenancies.length)];
      const amount = Math.floor(Math.random() * 50000) + 5000; // 5k to 55k
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      
      // Create payment date within last 6 months
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 180));
      
      const payment = {
        tenancy: tenancy._id,
        amount,
        currency: 'INR',
        status,
        paymentMethod,
        transactionId: status === 'completed' ? `TXN${Date.now()}${i}` : null,
        paidAt: status === 'completed' ? createdAt : null,
        createdAt,
        metadata: {
          isSample: true,
          notes: `Sample payment for ${tenancy.name}`,
          tenancyName: tenancy.name
        }
      };

      samplePayments.push(payment);
    }

    // Insert sample payments
    const insertedPayments = await TenancyPayment.insertMany(samplePayments);
    
    console.log(`✅ Created ${insertedPayments.length} sample payments`);
    
    // Show summary
    const stats = await TenancyPayment.aggregate([
      { $match: { 'metadata.isSample': true } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    console.log('\n📊 Payment Summary:');
    stats.forEach(stat => {
      console.log(`${stat._id}: ${stat.count} payments, ₹${stat.totalAmount.toLocaleString()}`);
    });

    console.log('\n🎉 Sample payments created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating sample payments:', error);
  } finally {
    mongoose.connection.close();
  }
}

createSamplePayments();