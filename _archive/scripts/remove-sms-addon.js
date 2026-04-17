
const mongoose = require('mongoose');
require('dotenv').config();

const addonSchema = new mongoose.Schema({
    displayName: String,
    status: String,
    showOnMarketplace: Boolean
});

const AddOn = mongoose.models.AddOn || mongoose.model('AddOn', addonSchema);

async function hideAddon() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('MONGODB_URI not found in environment variables');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Update the addon to be hidden
        const result = await AddOn.updateOne(
            { displayName: /SMS Pack/i },
            {
                $set: {
                    status: 'hidden',
                    showOnMarketplace: false
                }
            }
        );

        console.log('Update result:', result);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

hideAddon();
