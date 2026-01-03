# LaundryPro API Testing Guide

## Server Status
Backend server running on: http://localhost:5000

## Available Endpoints

### 1. Health Check
```bash
GET http://localhost:5000/health
```

### 2. User Registration
```bash
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "StrongPassword123!",
  "confirmPassword": "StrongPassword123!"
}
```

### 3. User Login
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "StrongPassword123!"
}
```

### 4. Get Profile (requires token)
```bash
GET http://localhost:5000/api/auth/profile
Authorization: Bearer YOUR_JWT_TOKEN
```

## Testing with Postman or Thunder Client

1. **Install VS Code Extension**: Thunder Client or use Postman
2. **Test Health Endpoint**: GET http://localhost:5000/health
3. **Test Registration**: Use the registration endpoint above
4. **Test Login**: Use the login endpoint above

## Current Limitations

⚠️ **MongoDB Connection**: The database connection may fail due to IP whitelisting. This affects:
- User registration/login (data won't persist)
- Address management

✅ **What Works Without Database**:
- Server health check
- API endpoint structure
- Authentication logic (JWT tokens)
- Email service configuration
- Password hashing and validation

## Next Steps to Make It Fully Functional

1. **Fix MongoDB Connection**:
   - Whitelist your IP in MongoDB Atlas
   - Or use local MongoDB instance

2. **Configure Email Service**:
   - Set up real Gmail credentials in .env file
   - Enable 2FA and generate App Password

3. **Build Frontend Registration**:
   - Create registration form components
   - Connect to backend API
   - Add authentication state management