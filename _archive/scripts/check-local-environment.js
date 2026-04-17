const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function checkLocalEnvironment() {
  console.log('🔍 Checking Local Development Environment...\n');
  
  // Check .env file
  const envPath = path.join(__dirname, '.env');
  console.log('📁 Environment File Check:');
  console.log(`   Path: ${envPath}`);
  console.log(`   Exists: ${fs.existsSync(envPath) ? '✅' : '❌'}`);
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    console.log(`   Variables: ${envLines.length} defined`);
  }
  
  // Check environment variables
  console.log('\n🔧 Environment Variables:');
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'PORT'];
  const optionalVars = ['NODE_ENV', 'FRONTEND_URL', 'ALLOWED_ORIGINS'];
  
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`   ${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
    if (value && varName !== 'JWT_SECRET') {
      console.log(`      Value: ${value}`);
    } else if (value && varName === 'JWT_SECRET') {
      console.log(`      Value: ${value.substring(0, 10)}...`);
    }
  });
  
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`   ${varName}: ${value ? '✅ Set' : '⚠️ Optional'}`);
    if (value) {
      console.log(`      Value: ${value}`);
    }
  });
  
  // Test MongoDB connection
  console.log('\n🗄️ MongoDB Connection Test:');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundrylobby';
  console.log(`   URI: ${mongoUri}`);
  
  try {
    console.log('   Connecting...');
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('   ✅ MongoDB connection successful');
    
    // Test collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`   📊 Collections found: ${collections.length}`);
    
    const importantCollections = ['superadmins', 'centeradmins', 'salesusers'];
    for (const collName of importantCollections) {
      const exists = collections.some(c => c.name === collName);
      console.log(`      ${collName}: ${exists ? '✅' : '❌'}`);
      
      if (exists) {
        const count = await mongoose.connection.db.collection(collName).countDocuments();
        console.log(`         Documents: ${count}`);
      }
    }
    
  } catch (error) {
    console.log('   ❌ MongoDB connection failed');
    console.log(`   Error: ${error.message}`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('   💡 Tip: Make sure MongoDB is running on port 27017');
    }
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
  
  // Check port availability
  console.log('\n🌐 Port Check:');
  const port = process.env.PORT || 5000;
  console.log(`   Target port: ${port}`);
  
  // Check if backend files exist
  console.log('\n📁 Backend Files Check:');
  const importantFiles = [
    'src/app.js',
    'src/models/SuperAdmin.js',
    'src/middlewares/salesOrSuperAdminAuth.js',
    'src/routes/upgradeRoutes.js'
  ];
  
  importantFiles.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    const exists = fs.existsSync(fullPath);
    console.log(`   ${filePath}: ${exists ? '✅' : '❌'}`);
  });
  
  console.log('\n🎯 Summary:');
  console.log('✅ Environment check complete');
  console.log('📝 Next steps:');
  console.log('   1. Fix any ❌ issues above');
  console.log('   2. Start backend: node src/app.js');
  console.log('   3. Test with: node ../test-local-superadmin-login.js --run');
}

// Run the check
checkLocalEnvironment().catch(console.error);