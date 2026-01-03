const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { generateEmailVerificationToken, verifyEmailVerificationToken } = require('../src/utils/jwt');

// Property-based testing for user registration integrity
describe('Property 1: User Registration Integrity', () => {
  beforeEach(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });
  });

  /**
   * Property 1: User Registration Integrity
   * For any valid email and password combination, successful registration should 
   * create exactly one user account with unverified email status
   * Validates: Requirements 1.1, 1.3
   */
  test('should create exactly one user with unverified email for valid registration data', async () => {
    const testCases = [
      {
        name: 'John Doe',
        email: 'john.doe@test.com',
        phone: '9876543210',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!'
      },
      {
        name: 'Jane Smith',
        email: 'jane.smith@test.com',
        phone: '9876543211',
        password: 'AnotherStrong456@',
        confirmPassword: 'AnotherStrong456@'
      },
      {
        name: 'Bob Johnson',
        email: 'bob.johnson@test.com',
        phone: '9876543212',
        password: 'SecurePass789#',
        confirmPassword: 'SecurePass789#'
      }
    ];

    for (const userData of testCases) {
      // Register user
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Verify response structure
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(userData.email);
      expect(response.body.data.name).toBe(userData.name);

      // Verify exactly one user was created
      const users = await User.find({ email: userData.email });
      expect(users).toHaveLength(1);

      const user = users[0];
      
      // Verify user properties
      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.phone).toBe(userData.phone);
      expect(user.isEmailVerified).toBe(false); // Should be unverified initially
      expect(user.isActive).toBe(true);
      expect(user.role).toBe('customer');

      // Verify password is hashed (not plain text)
      expect(user.password).not.toBe(userData.password);
      expect(user.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    }
  });

  /**
   * Property 2: Email Verification Completeness
   * For any user with pending email verification, completing verification should 
   * activate the account and invalidate the verification token
   * Validates: Requirements 1.2, 1.3
   */
  test('should activate account and invalidate token after email verification', async () => {
    const userData = {
      name: 'Test User',
      email: 'test.verification@test.com',
      phone: '9876543213',
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!'
    };

    // Register user
    await request(app)
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    // Get user from database
    let user = await User.findOne({ email: userData.email });
    expect(user.isEmailVerified).toBe(false);

    // Generate verification token
    const verificationToken = generateEmailVerificationToken(user._id, user.email);

    // Verify email
    const verifyResponse = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);

    // Verify response
    expect(verifyResponse.body.success).toBe(true);
    expect(verifyResponse.body.data.user.isEmailVerified).toBe(true);
    expect(verifyResponse.body.data.token).toBeDefined();

    // Verify user in database is activated
    user = await User.findOne({ email: userData.email });
    expect(user.isEmailVerified).toBe(true);

    // Verify token cannot be used again (should fail)
    await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(400);
  });

  test('should prevent duplicate registration with same email', async () => {
    const userData = {
      name: 'Test User',
      email: 'duplicate@test.com',
      phone: '9876543214',
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!'
    };

    // First registration should succeed
    await request(app)
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    // Second registration with same email should fail
    const duplicateData = {
      ...userData,
      name: 'Another User',
      phone: '9876543215'
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(duplicateData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('email already exists');

    // Verify only one user exists
    const users = await User.find({ email: userData.email });
    expect(users).toHaveLength(1);
  });

  test('should prevent duplicate registration with same phone', async () => {
    const userData1 = {
      name: 'Test User 1',
      email: 'user1@test.com',
      phone: '9876543216',
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!'
    };

    const userData2 = {
      name: 'Test User 2',
      email: 'user2@test.com',
      phone: '9876543216', // Same phone
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!'
    };

    // First registration should succeed
    await request(app)
      .post('/api/auth/register')
      .send(userData1)
      .expect(201);

    // Second registration with same phone should fail
    const response = await request(app)
      .post('/api/auth/register')
      .send(userData2)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('phone number already exists');
  });

  test('should validate password strength requirements', async () => {
    const weakPasswords = [
      'weak',           // Too short
      'password',       // No uppercase, numbers, special chars
      'Password',       // No numbers, special chars
      'Password123',    // No special chars
      'password123!',   // No uppercase
    ];

    for (const weakPassword of weakPasswords) {
      const userData = {
        name: 'Test User',
        email: `test.${Date.now()}@test.com`,
        phone: `987654${Math.floor(Math.random() * 10000)}`,
        password: weakPassword,
        confirmPassword: weakPassword
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    }
  });

  test('should validate email format', async () => {
    const invalidEmails = [
      'invalid-email',
      'invalid@',
      '@invalid.com',
      'invalid.email',
      'invalid@.com'
    ];

    for (const invalidEmail of invalidEmails) {
      const userData = {
        name: 'Test User',
        email: invalidEmail,
        phone: `987654${Math.floor(Math.random() * 10000)}`,
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    }
  });

  test('should validate phone number format', async () => {
    const invalidPhones = [
      '123456789',      // Too short
      '12345678901',    // Too long
      '0123456789',     // Starts with 0
      '5123456789',     // Starts with 5
      'abcdefghij',     // Non-numeric
    ];

    for (const invalidPhone of invalidPhones) {
      const userData = {
        name: 'Test User',
        email: `test.${Date.now()}@test.com`,
        phone: invalidPhone,
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    }
  });
});

/**
 * Property 3: Authentication State Consistency
 * For any successful login, the system should maintain consistent authentication state
 */
describe('Property 3: Authentication State Consistency', () => {
  let testUser;
  let verificationToken;

  beforeAll(async () => {
    // Create and verify a test user
    const userData = {
      name: 'Auth Test User',
      email: 'auth.test@test.com',
      phone: '9876543220',
      password: 'AuthTestPassword123!',
      confirmPassword: 'AuthTestPassword123!'
    };

    await request(app)
      .post('/api/auth/register')
      .send(userData);

    testUser = await User.findOne({ email: userData.email });
    verificationToken = generateEmailVerificationToken(testUser._id, testUser.email);

    // Verify email
    await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });
  });

  afterAll(async () => {
    await User.deleteOne({ email: 'auth.test@test.com' });
  });

  test('should maintain consistent authentication state after login', async () => {
    const loginData = {
      email: 'auth.test@test.com',
      password: 'AuthTestPassword123!'
    };

    const response = await request(app)
      .post('/api/auth/login')
      .send(loginData)
      .expect(200);

    // Verify response structure
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toBeDefined();
    expect(response.body.data.token).toBeDefined();

    const { user, token } = response.body.data;

    // Verify user data consistency
    expect(user.email).toBe(loginData.email);
    expect(user.isEmailVerified).toBe(true);
    expect(user.role).toBe('customer');

    // Verify token can be used for authenticated requests
    const profileResponse = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.data.user.email).toBe(loginData.email);
  });

  test('should reject login for unverified email', async () => {
    // Create unverified user
    const unverifiedUserData = {
      name: 'Unverified User',
      email: 'unverified@test.com',
      phone: '9876543221',
      password: 'UnverifiedPassword123!',
      confirmPassword: 'UnverifiedPassword123!'
    };

    await request(app)
      .post('/api/auth/register')
      .send(unverifiedUserData);

    // Try to login without verification
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: unverifiedUserData.email,
        password: unverifiedUserData.password
      })
      .expect(401);

    expect(loginResponse.body.success).toBe(false);
    expect(loginResponse.body.requiresEmailVerification).toBe(true);

    // Clean up
    await User.deleteOne({ email: unverifiedUserData.email });
  });
});