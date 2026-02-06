
const mongoose = require('mongoose');
require('dotenv').config();

const addonSchema = new mongoose.Schema({
    displayName: String,
    status: String,
    showOnMarketplace: Boolean
});

const AddOn = mongoose.models.AddOn || mongoose.model('AddOn', addonSchema);

async function checkAddons() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('MONGODB_URI not found in environment variables');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const addons = await AddOn.find({ displayName: /Priority Support/i });
        console.log('Found addons:', JSON.stringify(addons, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAddons();
