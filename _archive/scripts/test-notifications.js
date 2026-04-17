const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

async function triggerFailedLogin() {
    console.log(`🚀 Triggering failed login at ${API_URL}/superadmin/auth/login`);

    try {
        // Try a failed login with a non-existent email
        const response = await axios.post(`${API_URL}/superadmin/auth/login`, {
            email: `wrong-email-${Date.now()}@test.com`,
            password: 'wrongpassword'
        });
        console.log('Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('Expected failure received:', error.response.status, error.response.data);
            console.log('✅ Failed login triggered. This should have created a notification for all SuperAdmins.');
        } else {
            console.error('Connection error:', error.message);
        }
    }
}

triggerFailedLogin();
