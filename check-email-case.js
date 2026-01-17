const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/laundrylobby', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const salesUserSchema = new mongoose.Schema({
  email: String,
}, { timestamps: true });

const SalesUser = mongoose.model('SalesUser', salesUserSchema);

async function checkEmail() {
  try {
    const user1 = await SalesUser.findOne({ email: 'virat@sales.com' });
    const user2 = await SalesUser.findOne({ email: 'VIRAT@SALES.COM' });
    const user3 = await SalesUser.findOne({ email: { $regex: /^virat@sales\.com$/i } });
    
    console.log('Exact match (virat@sales.com):', user1 ? '✅ Found' : '❌ Not found');
    console.log('Uppercase match (VIRAT@SALES.COM):', user2 ? '✅ Found' : '❌ Not found');
    console.log('Case-insensitive match:', user3 ? '✅ Found' : '❌ Not found');
    
    if (user3) {
      console.log('\n📧 Actual email in DB:', user3.email);
      console.log('🔍 Email comparison:');
      console.log('   Input: virat@sales.com');
      console.log('   DB:   ', user3.email);
      console.log('   Match:', user3.email === 'virat@sales.com' ? '✅' : '❌');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkEmail();
