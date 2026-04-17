# Gmail SMTP Setup Guide for LaundryLobby

## Current Issue
The email service is configured but Gmail is rejecting the credentials with error:
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```

This means you need to set up a Gmail App Password for the application.

## Step-by-Step Setup

### Option 1: Gmail App Password (Recommended)

#### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account: https://myaccount.google.com/
2. Click on "Security" in the left sidebar
3. Under "Signing in to Google", click on "2-Step Verification"
4. Follow the steps to enable 2FA if not already enabled

#### Step 2: Generate App Password
1. After enabling 2FA, go back to Security settings
2. Under "Signing in to Google", click on "App passwords"
3. You might need to sign in again
4. Select "Mail" as the app
5. Select "Other (Custom name)" as the device
6. Enter "LaundryLobby" as the name
7. Click "Generate"
8. **Copy the 16-character password** (it will look like: `abcd efgh ijkl mnop`)

#### Step 3: Update .env File
Open `backend/.env` and update these lines:

```env
EMAIL_USER=your-actual-email@gmail.com
EMAIL_APP_PASSWORD=abcdefghijklmnop
```

**Important**: 
- Remove spaces from the app password
- Use your actual Gmail address
- Don't use your regular Gmail password

### Option 2: Less Secure Apps (Not Recommended)

If you can't use App Passwords, you can enable "Less secure app access":

1. Go to https://myaccount.google.com/lesssecureapps
2. Turn on "Allow less secure apps"
3. Update .env with your regular Gmail password

**Warning**: This is less secure and Google may block it.

### Option 3: Use a Different Email Service

If Gmail doesn't work, you can use other services:

#### SendGrid (Free tier available)
```javascript
// In backend/src/config/email.js
const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY
  }
});
```

#### Mailgun (Free tier available)
```javascript
const transporter = nodemailer.createTransport({
  host: 'smtp.mailgun.org',
  port: 587,
  auth: {
    user: process.env.MAILGUN_USER,
    pass: process.env.MAILGUN_PASSWORD
  }
});
```

## Testing the Email Service

After updating the credentials, test the email service:

```bash
cd backend
node test-email.js
```

You should see:
```
✅ Email configuration verified successfully!
```

## Current Configuration

Your current `.env` file has:
```env
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
```

These are placeholder values that need to be replaced with real credentials.

## Quick Fix for Development

If you want to test without email for now, the system will still work:

1. **Registration works**: Users are created in database
2. **Email fails gracefully**: Error is logged but registration succeeds
3. **Manual verification**: You can verify users manually in database

To manually verify a user in MongoDB:
```javascript
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { isEmailVerified: true } }
)
```

## Production Recommendations

For production, use a professional email service:

1. **SendGrid** (Recommended)
   - Free tier: 100 emails/day
   - Easy setup
   - Good deliverability
   - https://sendgrid.com/

2. **AWS SES** (For scale)
   - Very cheap
   - High volume
   - Requires AWS account
   - https://aws.amazon.com/ses/

3. **Mailgun**
   - Free tier: 5,000 emails/month
   - Good for transactional emails
   - https://www.mailgun.com/

## Troubleshooting

### Error: "Invalid login"
- Make sure 2FA is enabled
- Generate a new App Password
- Remove spaces from the password
- Use the correct Gmail address

### Error: "Less secure app access"
- Enable App Passwords instead
- Or enable less secure apps (not recommended)

### Error: "Daily sending quota exceeded"
- Gmail free accounts: 500 emails/day
- Use a professional service for higher volume

### Emails going to spam
- Set up SPF, DKIM, DMARC records
- Use a professional email service
- Warm up your sending domain

## Current Status

✅ **What's Working**:
- Email service is configured
- Registration creates users successfully
- Email sending is attempted
- Errors are handled gracefully

❌ **What Needs Setup**:
- Valid Gmail App Password
- Or alternative email service credentials

## Next Steps

1. **Choose an option above** (App Password recommended)
2. **Update backend/.env** with real credentials
3. **Test with**: `node test-email.js`
4. **Try registration** at http://localhost:3002/auth/register
5. **Check your email** for verification link

## Support

If you continue to have issues:
1. Check Gmail security settings
2. Try a different Gmail account
3. Use SendGrid or another service
4. Contact support with error logs