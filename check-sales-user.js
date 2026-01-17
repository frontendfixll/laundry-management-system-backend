const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/laundrylobby', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define SalesUser schema (simplified)
const salesUserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  phone: String,
  employeeId: String,
  designation: String,
  role: String,
  isActive: Boolean,
}, { timestamps: true });

const SalesUser = mongoose.model('SalesUser', salesUserSchema);

async function checkSalesUsers() {
  try {
    const users = await SalesUser.find({});
    
    console.log('\n📊 Total Sales Users:', users.length);
    console.log('─────────────────────────────────────\n');
    
    if (users.length === 0) {
      console.log('❌ No sales users found in database!');
      console.log('\n💡 Run create-sales-user.js to create one.\n');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🆔 Employee ID: ${user.employeeId}`);
        console.log(`   📱 Phone: ${user.phone}`);
        console.log(`   💼 Designation: ${user.designation}`);
        console.log(`   ✅ Active: ${user.isActive}`);
        console.log(`   🔑 Role: ${user.role}`);
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSalesUsers();
