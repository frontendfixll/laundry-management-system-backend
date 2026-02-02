const mongoose = require('mongoose')
const AuditLog = require('../src/models/AuditLog')
const ComplianceRecord = require('../src/models/ComplianceRecord')
const SecurityEvent = require('../src/models/SecurityEvent')

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})

async function populateAuditData() {
  try {
    console.log('🔄 Populating audit data...')

    // Clear existing data
    await Promise.all([
      AuditLog.deleteMany({}),
      ComplianceRecord.deleteMany({}),
      SecurityEvent.deleteMany({})
    ])

    // Create sample audit logs
    const auditLogs = []
    const actions = [
      'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'LOGIN', 'LOGOUT',
      'CREATE_TENANCY', 'UPDATE_TENANCY', 'APPROVE_REFUND', 'PROCESS_PAYMENT',
      'CREATE_TICKET', 'RESOLVE_TICKET', 'IMPERSONATE_START', 'DATA_EXPORT'
    ]
    
    const entities = ['User', 'Tenancy', 'Order', 'Transaction', 'Ticket', 'System']
    const roles = ['Super Admin', 'Platform Support', 'Platform Finance Admin', 'Tenant Admin']
    const severities = ['low', 'medium', 'high', 'critical']
    const outcomes = ['success', 'failure', 'warning']

    for (let i = 0; i < 100; i++) {
      const action = actions[Math.floor(Math.random() * actions.length)]
      const entity = entities[Math.floor(Math.random() * entities.length)]
      const role = roles[Math.floor(Math.random() * roles.length)]
      const severity = severities[Math.floor(Math.random() * severities.length)]
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)]
      
      auditLogs.push({
        who: `user${i}@laundrylobby.com`,
        whoId: new mongoose.Types.ObjectId(),
        role,
        action,
        entity,
        entityId: `entity_${i}`,
        tenantId: Math.random() > 0.3 ? new mongoose.Types.ObjectId() : null,
        tenantName: Math.random() > 0.3 ? `Tenant ${i}` : 'Platform',
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        outcome,
        severity,
        details: { sampleData: true, index: i },
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Last 30 days
        complianceFlags: Math.random() > 0.7 ? ['GDPR'] : []
      })
    }

    // Use the static method to create audit logs with proper hashing
    for (const logData of auditLogs) {
      await AuditLog.logAction(logData)
    }

    console.log(`✅ Created ${auditLogs.length} audit logs`)

    // Create sample compliance records
    const complianceRecords = [
      {
        framework: 'GDPR',
        requirement: 'Article 32 - Security of processing',
        requirementId: 'GDPR-32',
        description: 'Implement appropriate technical and organizational measures to ensure security',
        category: 'Data Protection',
        status: 'compliant',
        riskLevel: 'medium',
        lastAssessment: {
          date: new Date(),
          assessedBy: 'auditor@laundrylobby.com',
          assessorId: new mongoose.Types.ObjectId(),
          method: 'manual',
          notes: 'All security measures in place'
        },
        nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        reviewFrequency: 'quarterly',
        scoreWeight: 8
      },
      {
        framework: 'PCI_DSS',
        requirement: 'Requirement 10.2 - Audit trail requirements',
        requirementId: 'PCI-10.2',
        description: 'Implement automated audit trails for all system components',
        category: 'Audit Logging',
        status: 'compliant',
        riskLevel: 'high',
        lastAssessment: {
          date: new Date(),
          assessedBy: 'auditor@laundrylobby.com',
          assessorId: new mongoose.Types.ObjectId(),
          method: 'automated',
          notes: 'Audit logging system operational'
        },
        nextReview: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        reviewFrequency: 'monthly',
        scoreWeight: 10
      },
      {
        framework: 'SOC2_TYPE_II',
        requirement: 'CC6.1 - Logical Access Controls',
        requirementId: 'SOC2-CC6.1',
        description: 'Implement logical access security measures',
        category: 'Access Control',
        status: 'pending_review',
        riskLevel: 'medium',
        lastAssessment: {
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          assessedBy: 'auditor@laundrylobby.com',
          assessorId: new mongoose.Types.ObjectId(),
          method: 'external_audit',
          notes: 'Pending external audit review'
        },
        nextReview: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        reviewFrequency: 'quarterly',
        scoreWeight: 7
      },
      {
        framework: 'CCPA',
        requirement: 'Section 1798.105 - Right to delete',
        requirementId: 'CCPA-1798.105',
        description: 'Implement consumer right to delete personal information',
        category: 'Data Retention',
        status: 'non_compliant',
        riskLevel: 'high',
        lastAssessment: {
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          assessedBy: 'auditor@laundrylobby.com',
          assessorId: new mongoose.Types.ObjectId(),
          method: 'manual',
          notes: 'Data deletion process needs implementation'
        },
        nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reviewFrequency: 'weekly',
        remediation: {
          required: true,
          plan: 'Implement automated data deletion system',
          assignedTo: 'dev-team@laundrylobby.com',
          assigneeId: new mongoose.Types.ObjectId(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'in_progress'
        },
        scoreWeight: 9
      }
    ]

    await ComplianceRecord.insertMany(complianceRecords)
    console.log(`✅ Created ${complianceRecords.length} compliance records`)

    // Create sample security events
    const securityEvents = []
    const eventTypes = [
      'LOGIN_FAILED', 'LOGIN_BRUTE_FORCE', 'PERMISSION_DENIED', 'SUSPICIOUS_ACTIVITY',
      'UNAUTHORIZED_ACCESS', 'RATE_LIMIT_EXCEEDED', 'UNUSUAL_BEHAVIOR'
    ]
    
    const severityLevels = ['low', 'medium', 'high', 'critical']
    const statuses = ['detected', 'investigating', 'confirmed', 'resolved']

    for (let i = 0; i < 50; i++) {
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)]
      const severity = severityLevels[Math.floor(Math.random() * severityLevels.length)]
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      
      const event = {
        eventType,
        severity,
        sourceIp: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        sourceCountry: ['US', 'IN', 'CN', 'RU', 'BR'][Math.floor(Math.random() * 5)],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        userId: Math.random() > 0.5 ? new mongoose.Types.ObjectId() : null,
        username: Math.random() > 0.5 ? `user${i}@example.com` : null,
        userRole: Math.random() > 0.5 ? roles[Math.floor(Math.random() * roles.length)] : null,
        tenantId: Math.random() > 0.3 ? new mongoose.Types.ObjectId() : null,
        description: `Security event ${i}: ${eventType}`,
        details: { 
          sampleEvent: true, 
          index: i,
          attempts: Math.floor(Math.random() * 20) + 1
        },
        detectionMethod: 'automated',
        detectionRule: `RULE_${eventType}`,
        detectionScore: Math.floor(Math.random() * 100),
        status,
        resolved: status === 'resolved',
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }

      securityEvents.push(event)
    }

    // Use the static method to create security events with proper risk scoring
    for (const eventData of securityEvents) {
      await SecurityEvent.createEvent(eventData)
    }

    console.log(`✅ Created ${securityEvents.length} security events`)

    // Verify data integrity
    const auditIntegrity = await AuditLog.verifyIntegrity()
    console.log(`🔍 Audit log integrity check: ${auditIntegrity.integrityIssues} issues found`)

    console.log('✅ Audit data population completed successfully!')
    
    // Display summary
    const [auditCount, complianceCount, securityCount] = await Promise.all([
      AuditLog.countDocuments(),
      ComplianceRecord.countDocuments(),
      SecurityEvent.countDocuments()
    ])

    console.log('\n📊 SUMMARY:')
    console.log(`- Audit Logs: ${auditCount}`)
    console.log(`- Compliance Records: ${complianceCount}`)
    console.log(`- Security Events: ${securityCount}`)
    console.log(`- Total Records: ${auditCount + complianceCount + securityCount}`)

  } catch (error) {
    console.error('❌ Error populating audit data:', error)
  } finally {
    mongoose.connection.close()
  }
}

// Run the population script
populateAuditData()