const request = require('supertest');
const app = require('../src/app');
const Lead = require('../src/models/Lead');
const Notification = require('../src/models/Notification');
const SuperAdmin = require('../src/models/SuperAdmin');
const { NOTIFICATION_TYPES } = require('../src/config/constants');
const { LEAD_STATUS, BUSINESS_TYPES } = require('../src/models/Lead');

/**
 * Feature: marketing-landing-page
 * Property 2: Lead Creation Round Trip
 * 
 * For any valid lead form data submitted through the API, creating a lead 
 * and then retrieving it SHALL return the same data with status "new" 
 * and a valid timestamp.
 * 
 * Validates: Requirements 3.3, 4.1, 4.2, 4.3, 4.4
 */
describe('Property 2: Lead Creation Round Trip', () => {
  // Test data generators
  const generateRandomString = (length) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('').trim() || 'Test';
  };

  const generateRandomEmail = () => {
    const domains = ['test.com', 'example.com', 'demo.org'];
    const name = generateRandomString(8).toLowerCase().replace(/\s/g, '');
    return `${name}${Date.now()}@${domains[Math.floor(Math.random() * domains.length)]}`;
  };

  const generateRandomPhone = () => {
    return '9' + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  };

  const generateValidLeadData = () => {
    const businessTypes = Object.values(BUSINESS_TYPES);
    return {
      name: generateRandomString(Math.floor(Math.random() * 50) + 2),
      email: generateRandomEmail(),
      phone: generateRandomPhone(),
      businessName: generateRandomString(Math.floor(Math.random() * 100) + 2),
      businessType: businessTypes[Math.floor(Math.random() * businessTypes.length)],
      message: Math.random() > 0.5 ? generateRandomString(Math.floor(Math.random() * 500)) : undefined
    };
  };

  beforeEach(async () => {
    // Clean up test leads
    await Lead.deleteMany({ email: { $regex: /@(test|example|demo)\.(com|org)$/ } });
  });

  afterAll(async () => {
    // Clean up test leads
    await Lead.deleteMany({ email: { $regex: /@(test|example|demo)\.(com|org)$/ } });
  });

  test('should create lead and retrieve with same data, status "new", and valid timestamp (100 iterations)', async () => {
    const iterations = 100;
    
    for (let i = 0; i < iterations; i++) {
      const leadData = generateValidLeadData();
      const beforeCreate = new Date();

      // Create lead via API
      const createResponse = await request(app)
        .post('/api/public/leads')
        .send(leadData)
        .expect(201);

      const afterCreate = new Date();

      // Verify creation response
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.leadId).toBeDefined();

      // Retrieve lead from database
      const lead = await Lead.findById(createResponse.body.data.leadId).lean();

      // Verify round trip - data matches
      expect(lead.name).toBe(leadData.name);
      expect(lead.email).toBe(leadData.email.toLowerCase()); // Email is normalized
      expect(lead.phone).toBe(leadData.phone);
      expect(lead.businessName).toBe(leadData.businessName);
      expect(lead.businessType).toBe(leadData.businessType);
      
      if (leadData.message) {
        expect(lead.message).toBe(leadData.message);
      }

      // Verify status is "new"
      expect(lead.status).toBe(LEAD_STATUS.NEW);

      // Verify valid timestamp
      expect(lead.createdAt).toBeDefined();
      const createdAt = new Date(lead.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    }
  });

  test('should store all required fields correctly for any valid input', async () => {
    const requiredFields = ['name', 'email', 'phone', 'businessName', 'businessType'];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const leadData = generateValidLeadData();

      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData)
        .expect(201);

      const lead = await Lead.findById(response.body.data.leadId).lean();

      // Verify all required fields are stored
      for (const field of requiredFields) {
        expect(lead[field]).toBeDefined();
        expect(lead[field]).not.toBeNull();
        expect(lead[field].length).toBeGreaterThan(0);
      }

      // Verify timestamps exist
      expect(lead.createdAt).toBeDefined();
      expect(lead.updatedAt).toBeDefined();
    }
  });

  test('should return success response for any valid lead data', async () => {
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const leadData = generateValidLeadData();

      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData);

      // Verify success response structure
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();
      expect(response.body.data).toBeDefined();
      expect(response.body.data.leadId).toBeDefined();
    }
  });
});

/**
 * Feature: marketing-landing-page
 * Property 1: Lead Form Validation Rejects Invalid Input
 * 
 * For any form submission with missing required fields or invalid email format,
 * the Lead_Form SHALL display validation errors and prevent submission.
 * 
 * Validates: Requirements 3.5
 */
describe('Property 1: Lead Form Validation Rejects Invalid Input', () => {
  const generateInvalidEmail = () => {
    const invalidPatterns = [
      'invalid-email',
      'invalid@',
      '@invalid.com',
      'invalid.email',
      'invalid@.com',
      '',
      'spaces in@email.com',
      'double@@email.com'
    ];
    return invalidPatterns[Math.floor(Math.random() * invalidPatterns.length)];
  };

  test('should reject submissions with missing required fields (100 iterations)', async () => {
    const requiredFields = ['name', 'email', 'phone', 'businessName', 'businessType'];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      // Pick a random field to omit
      const fieldToOmit = requiredFields[Math.floor(Math.random() * requiredFields.length)];
      
      const leadData = {
        name: 'Test Name',
        email: `test${Date.now()}@test.com`,
        phone: '9876543210',
        businessName: 'Test Business',
        businessType: 'small_laundry'
      };

      // Remove the field
      delete leadData[fieldToOmit];

      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData);

      // Should be rejected
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    }
  });

  test('should reject submissions with invalid email format', async () => {
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const leadData = {
        name: 'Test Name',
        email: generateInvalidEmail(),
        phone: '9876543210',
        businessName: 'Test Business',
        businessType: 'small_laundry'
      };

      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData);

      // Should be rejected
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }
  });

  test('should reject submissions with invalid business type', async () => {
    const invalidTypes = ['invalid', 'unknown', 'laundry', 'SMALL_LAUNDRY', ''];
    
    for (const invalidType of invalidTypes) {
      const leadData = {
        name: 'Test Name',
        email: `test${Date.now()}@test.com`,
        phone: '9876543210',
        businessName: 'Test Business',
        businessType: invalidType
      };

      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }
  });
});


/**
 * Feature: marketing-landing-page
 * Property 3: Lead Notification Creation
 * 
 * For any newly created lead, the system SHALL create exactly one notification 
 * for each active superadmin user with type "new_lead" and reference to the lead.
 * 
 * Validates: Requirements 5.1
 */
describe('Property 3: Lead Notification Creation', () => {
  let testSuperAdmins = [];

  const generateValidLeadData = () => {
    const businessTypes = Object.values(BUSINESS_TYPES);
    return {
      name: `Test Lead ${Date.now()}`,
      email: `lead${Date.now()}@notification-test.com`,
      phone: '9' + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join(''),
      businessName: `Test Business ${Date.now()}`,
      businessType: businessTypes[Math.floor(Math.random() * businessTypes.length)],
      message: 'Test message for notification'
    };
  };

  beforeAll(async () => {
    // Create test superadmins for notification testing
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('TestPassword123!', 12);

    // Create 3 active superadmins
    for (let i = 0; i < 3; i++) {
      const superAdmin = await SuperAdmin.create({
        name: `Test SuperAdmin ${i}`,
        email: `superadmin${i}${Date.now()}@notification-test.com`,
        password: hashedPassword,
        isActive: true
      });
      testSuperAdmins.push(superAdmin);
    }

    // Create 1 inactive superadmin (should not receive notifications)
    const inactiveSuperAdmin = await SuperAdmin.create({
      name: 'Inactive SuperAdmin',
      email: `inactive${Date.now()}@notification-test.com`,
      password: hashedPassword,
      isActive: false
    });
    testSuperAdmins.push(inactiveSuperAdmin);
  });

  afterAll(async () => {
    // Clean up test data
    const testEmails = testSuperAdmins.map(sa => sa.email);
    await SuperAdmin.deleteMany({ email: { $in: testEmails } });
    await Lead.deleteMany({ email: { $regex: /@notification-test\.com$/ } });
    await Notification.deleteMany({ 
      recipient: { $in: testSuperAdmins.map(sa => sa._id) } 
    });
  });

  beforeEach(async () => {
    // Clean up notifications before each test
    await Notification.deleteMany({ 
      recipient: { $in: testSuperAdmins.map(sa => sa._id) } 
    });
  });

  test('should create exactly one notification per active superadmin for each new lead', async () => {
    const iterations = 20;
    const activeSuperAdmins = testSuperAdmins.filter(sa => sa.isActive);
    const inactiveSuperAdmins = testSuperAdmins.filter(sa => !sa.isActive);

    for (let i = 0; i < iterations; i++) {
      const leadData = generateValidLeadData();

      // Create lead
      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData)
        .expect(201);

      const leadId = response.body.data.leadId;

      // Wait a bit for async notification creation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check notifications for each active superadmin
      for (const superAdmin of activeSuperAdmins) {
        const notifications = await Notification.find({
          recipient: superAdmin._id,
          type: NOTIFICATION_TYPES.NEW_LEAD,
          'data.additionalData.leadId': leadId
        });

        // Should have exactly one notification
        expect(notifications).toHaveLength(1);

        const notification = notifications[0];
        expect(notification.type).toBe(NOTIFICATION_TYPES.NEW_LEAD);
        expect(notification.title).toBe('New Lead Received');
        expect(notification.message).toContain(leadData.businessName);
        expect(notification.data.additionalData.leadId.toString()).toBe(leadId);
        expect(notification.channels.inApp).toBe(true);
        expect(notification.channels.email).toBe(false);
      }

      // Check that inactive superadmins did NOT receive notifications
      for (const superAdmin of inactiveSuperAdmins) {
        const notifications = await Notification.find({
          recipient: superAdmin._id,
          type: NOTIFICATION_TYPES.NEW_LEAD,
          'data.additionalData.leadId': leadId
        });

        expect(notifications).toHaveLength(0);
      }

      // Clean up for next iteration
      await Notification.deleteMany({ 
        'data.additionalData.leadId': leadId 
      });
    }
  });

  test('should create notifications with correct type and reference for any valid lead', async () => {
    const iterations = 30;
    const activeSuperAdmins = testSuperAdmins.filter(sa => sa.isActive);

    for (let i = 0; i < iterations; i++) {
      const leadData = generateValidLeadData();

      const response = await request(app)
        .post('/api/public/leads')
        .send(leadData)
        .expect(201);

      const leadId = response.body.data.leadId;

      // Wait for async notification creation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify notification properties
      const notifications = await Notification.find({
        type: NOTIFICATION_TYPES.NEW_LEAD,
        'data.additionalData.leadId': leadId
      });

      // Should have one notification per active superadmin
      expect(notifications.length).toBe(activeSuperAdmins.length);

      for (const notification of notifications) {
        // Verify notification type
        expect(notification.type).toBe(NOTIFICATION_TYPES.NEW_LEAD);
        
        // Verify lead reference
        expect(notification.data.additionalData.leadId.toString()).toBe(leadId);
        
        // Verify recipient is an active superadmin
        const recipientIsActive = activeSuperAdmins.some(
          sa => sa._id.toString() === notification.recipient.toString()
        );
        expect(recipientIsActive).toBe(true);
        
        // Verify in-app channel is enabled
        expect(notification.channels.inApp).toBe(true);
      }

      // Clean up
      await Notification.deleteMany({ 'data.additionalData.leadId': leadId });
    }
  });

  test('should not create duplicate notifications for the same lead', async () => {
    const leadData = generateValidLeadData();
    const activeSuperAdmins = testSuperAdmins.filter(sa => sa.isActive);

    // Create lead
    const response = await request(app)
      .post('/api/public/leads')
      .send(leadData)
      .expect(201);

    const leadId = response.body.data.leadId;

    // Wait for notifications
    await new Promise(resolve => setTimeout(resolve, 200));

    // Count total notifications for this lead
    const totalNotifications = await Notification.countDocuments({
      type: NOTIFICATION_TYPES.NEW_LEAD,
      'data.additionalData.leadId': leadId
    });

    // Should be exactly equal to number of active superadmins
    expect(totalNotifications).toBe(activeSuperAdmins.length);
  });
});


/**
 * Feature: marketing-landing-page
 * Property 6: Lead Status Filtering
 * 
 * For any status filter applied to the lead list, all returned leads SHALL have 
 * the specified status, and no leads with different statuses SHALL be included.
 * 
 * Validates: Requirements 6.3
 */
describe('Property 6: Lead Status Filtering', () => {
  let testLeads = [];
  let authToken;
  let testSuperAdmin;

  beforeAll(async () => {
    // Create test superadmin for authenticated requests
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const hashedPassword = await bcrypt.hash('TestPassword123!', 12);

    testSuperAdmin = await SuperAdmin.create({
      name: 'Filter Test SuperAdmin',
      email: `filtertest${Date.now()}@superadmin-test.com`,
      password: hashedPassword,
      isActive: true
    });

    // Generate auth token
    authToken = jwt.sign(
      { adminId: testSuperAdmin._id, email: testSuperAdmin.email, role: 'superadmin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test leads with different statuses
    const statuses = Object.values(LEAD_STATUS);
    for (let i = 0; i < 40; i++) {
      const lead = await Lead.create({
        name: `Filter Test Lead ${i}`,
        email: `filtertest${i}${Date.now()}@filter-test.com`,
        phone: '9' + String(i).padStart(9, '0'),
        businessName: `Filter Test Business ${i}`,
        businessType: 'small_laundry',
        status: statuses[i % statuses.length]
      });
      testLeads.push(lead);
    }
  });

  afterAll(async () => {
    await Lead.deleteMany({ email: { $regex: /@filter-test\.com$/ } });
    await SuperAdmin.deleteOne({ _id: testSuperAdmin._id });
  });

  test('should return only leads with specified status for any status filter', async () => {
    const statuses = Object.values(LEAD_STATUS);

    for (const status of statuses) {
      const response = await request(app)
        .get(`/api/superadmin/leads?status=${status}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.leads).toBeDefined();

      // Verify ALL returned leads have the specified status
      for (const lead of response.body.data.leads) {
        expect(lead.status).toBe(status);
      }

      // Verify no leads with different status are included
      const otherStatuses = statuses.filter(s => s !== status);
      for (const lead of response.body.data.leads) {
        expect(otherStatuses).not.toContain(lead.status);
      }
    }
  });

  test('should return all leads when no status filter is applied', async () => {
    const response = await request(app)
      .get('/api/superadmin/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.leads.length).toBeGreaterThan(0);

    // Should contain leads with various statuses
    const returnedStatuses = new Set(response.body.data.leads.map(l => l.status));
    expect(returnedStatuses.size).toBeGreaterThan(1);
  });

  test('should reject invalid status filter values', async () => {
    const invalidStatuses = ['invalid', 'pending', 'active', 'NEW', ''];

    for (const invalidStatus of invalidStatuses) {
      const response = await request(app)
        .get(`/api/superadmin/leads?status=${invalidStatus}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (invalidStatus === '') {
        // Empty string might be treated as no filter
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      }
    }
  });
});

/**
 * Feature: marketing-landing-page
 * Property 8: Lead Sorting by Date
 * 
 * For any list of leads returned by the API without explicit sort parameter, 
 * leads SHALL be sorted by createdAt in descending order (newest first).
 * 
 * Validates: Requirements 6.6
 */
describe('Property 8: Lead Sorting by Date', () => {
  let testLeads = [];
  let authToken;
  let testSuperAdmin;

  beforeAll(async () => {
    // Create test superadmin
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const hashedPassword = await bcrypt.hash('TestPassword123!', 12);

    testSuperAdmin = await SuperAdmin.create({
      name: 'Sort Test SuperAdmin',
      email: `sorttest${Date.now()}@superadmin-test.com`,
      password: hashedPassword,
      isActive: true
    });

    authToken = jwt.sign(
      { adminId: testSuperAdmin._id, email: testSuperAdmin.email, role: 'superadmin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test leads with different timestamps
    for (let i = 0; i < 20; i++) {
      const lead = await Lead.create({
        name: `Sort Test Lead ${i}`,
        email: `sorttest${i}${Date.now()}@sort-test.com`,
        phone: '9' + String(i).padStart(9, '0'),
        businessName: `Sort Test Business ${i}`,
        businessType: 'chain',
        status: 'new'
      });
      testLeads.push(lead);
      
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });

  afterAll(async () => {
    await Lead.deleteMany({ email: { $regex: /@sort-test\.com$/ } });
    await SuperAdmin.deleteOne({ _id: testSuperAdmin._id });
  });

  test('should return leads sorted by createdAt descending (newest first)', async () => {
    const response = await request(app)
      .get('/api/superadmin/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const leads = response.body.data.leads;
    expect(leads.length).toBeGreaterThan(1);

    // Verify descending order
    for (let i = 0; i < leads.length - 1; i++) {
      const currentDate = new Date(leads[i].createdAt);
      const nextDate = new Date(leads[i + 1].createdAt);
      expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
    }
  });

  test('should maintain sort order across paginated results', async () => {
    // Get first page
    const page1Response = await request(app)
      .get('/api/superadmin/leads?page=1&limit=5')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Get second page
    const page2Response = await request(app)
      .get('/api/superadmin/leads?page=2&limit=5')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const page1Leads = page1Response.body.data.leads;
    const page2Leads = page2Response.body.data.leads;

    if (page1Leads.length > 0 && page2Leads.length > 0) {
      // Last item of page 1 should be newer than or equal to first item of page 2
      const lastPage1Date = new Date(page1Leads[page1Leads.length - 1].createdAt);
      const firstPage2Date = new Date(page2Leads[0].createdAt);
      expect(lastPage1Date.getTime()).toBeGreaterThanOrEqual(firstPage2Date.getTime());
    }
  });

  test('should sort correctly regardless of status filter', async () => {
    const statuses = Object.values(LEAD_STATUS);

    for (const status of statuses) {
      const response = await request(app)
        .get(`/api/superadmin/leads?status=${status}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const leads = response.body.data.leads;
      
      // Verify descending order within filtered results
      for (let i = 0; i < leads.length - 1; i++) {
        const currentDate = new Date(leads[i].createdAt);
        const nextDate = new Date(leads[i + 1].createdAt);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
    }
  });
});

/**
 * Feature: marketing-landing-page
 * Property 7: Lead Status Update Persistence
 * 
 * For any lead status update operation, the new status SHALL be persisted 
 * and subsequent retrieval SHALL return the updated status.
 * 
 * Validates: Requirements 6.5
 */
describe('Property 7: Lead Status Update Persistence', () => {
  let authToken;
  let testSuperAdmin;

  beforeAll(async () => {
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const hashedPassword = await bcrypt.hash('TestPassword123!', 12);

    testSuperAdmin = await SuperAdmin.create({
      name: 'Update Test SuperAdmin',
      email: `updatetest${Date.now()}@superadmin-test.com`,
      password: hashedPassword,
      isActive: true
    });

    authToken = jwt.sign(
      { adminId: testSuperAdmin._id, email: testSuperAdmin.email, role: 'superadmin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Lead.deleteMany({ email: { $regex: /@update-test\.com$/ } });
    await SuperAdmin.deleteOne({ _id: testSuperAdmin._id });
  });

  test('should persist status updates and return updated status on retrieval (100 iterations)', async () => {
    const statuses = Object.values(LEAD_STATUS);
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      // Create a new lead
      const lead = await Lead.create({
        name: `Update Test Lead ${i}`,
        email: `updatetest${i}${Date.now()}@update-test.com`,
        phone: '9' + String(i).padStart(9, '0'),
        businessName: `Update Test Business ${i}`,
        businessType: 'dry_cleaner',
        status: 'new'
      });

      // Pick a random new status
      const newStatus = statuses[Math.floor(Math.random() * statuses.length)];

      // Update the lead status
      const updateResponse = await request(app)
        .patch(`/api/superadmin/leads/${lead._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: newStatus })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.status).toBe(newStatus);

      // Retrieve the lead and verify status persisted
      const getResponse = await request(app)
        .get(`/api/superadmin/leads/${lead._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.status).toBe(newStatus);

      // Also verify directly in database
      const dbLead = await Lead.findById(lead._id);
      expect(dbLead.status).toBe(newStatus);
    }
  });

  test('should persist notes updates along with status', async () => {
    const iterations = 30;

    for (let i = 0; i < iterations; i++) {
      const lead = await Lead.create({
        name: `Notes Test Lead ${i}`,
        email: `notestest${i}${Date.now()}@update-test.com`,
        phone: '9' + String(i).padStart(9, '0'),
        businessName: `Notes Test Business ${i}`,
        businessType: 'other',
        status: 'new'
      });

      const newNotes = `Test notes for iteration ${i} - ${Date.now()}`;
      const newStatus = 'contacted';

      // Update both status and notes
      const updateResponse = await request(app)
        .patch(`/api/superadmin/leads/${lead._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: newStatus, notes: newNotes })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.status).toBe(newStatus);
      expect(updateResponse.body.data.notes).toBe(newNotes);

      // Verify persistence
      const dbLead = await Lead.findById(lead._id);
      expect(dbLead.status).toBe(newStatus);
      expect(dbLead.notes).toBe(newNotes);
    }
  });

  test('should reject invalid status values', async () => {
    const lead = await Lead.create({
      name: 'Invalid Status Test Lead',
      email: `invalidstatus${Date.now()}@update-test.com`,
      phone: '9876543210',
      businessName: 'Invalid Status Test Business',
      businessType: 'small_laundry',
      status: 'new'
    });

    const invalidStatuses = ['invalid', 'pending', 'active', 'NEW', 'Contacted'];

    for (const invalidStatus of invalidStatuses) {
      const response = await request(app)
        .patch(`/api/superadmin/leads/${lead._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: invalidStatus })
        .expect(400);

      expect(response.body.success).toBe(false);
    }

    // Verify original status unchanged
    const dbLead = await Lead.findById(lead._id);
    expect(dbLead.status).toBe('new');
  });
});
