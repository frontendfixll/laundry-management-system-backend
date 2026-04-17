const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const Notification = require('./src/models/Notification');
const SuperAdmin = require('./src/models/SuperAdmin');

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const saCount = await SuperAdmin.countDocuments();
        console.log('SuperAdmins count:', saCount);

        const sas = await SuperAdmin.find({ isActive: true }).select('_id email');
        console.log('Active SuperAdmins:', sas);

        const notifications = await Notification.find({ recipientModel: 'SuperAdmin' }).limit(5).lean();
        console.log('Total SuperAdmin notifications in DB:', await Notification.countDocuments({ recipientModel: 'SuperAdmin' }));
        console.log('Recent SuperAdmin notifications:', notifications);

        const allNotifs = await Notification.find().sort({ createdAt: -1 }).limit(10).lean();
        console.log('Total notifications:', await Notification.countDocuments());
        console.log('Most recent 10 notifications (any):', allNotifs.map(n => ({
            _id: n._id,
            title: n.title,
            recipient: n.recipient,
            recipientType: n.recipientType,
            recipientModel: n.recipientModel,
            createdAt: n.createdAt
        })));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
