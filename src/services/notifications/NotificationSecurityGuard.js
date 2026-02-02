/**
 * NotificationSecurityGuard - Tenant isolation and security enforcement
 * Part of the Socket.IO Notification Engine Implementation
 */

const crypto = require('crypto');
const { NotificationAuditLogger } = require('./NotificationAuditLogger');

class NotificationSecurityGuard {
  constructor() {
    this.auditLogger = new NotificationAuditLogger();
    
    // Security rules and policies
    this.securityPolicies = {
      // Tenant isolation rules
      tenantIsolation: {
        enforceStrict: true,
        allowCrossTenantForRoles: ['superadmin', 'platform_support'],
        logAllCrossTenantAttempts: true
      },
      
      // Data masking rules
      dataMasking: {
        enabled: true,
        maskFields: ['amount', 'phone', 'email', 'address', 'cardNumber'],
        maskThreshold: {
          amount: 1000, // Mask amounts over $1000
          phone: true,  // Always mask phone numbers
          email: true   // Always mask email addresses
        }
      },
      
      // PII protection
      piiProtection: {
        enabled: true,
        strictMode: true,
        allowedFields: ['firstName', 'businessName', 'orderId'],
        blockedFields: ['ssn', 'taxId', 'bankAccount', 'creditCard']
      },
      
      // Rate limiting for security
      securityRateLimits: {
        maxNotificationsPerUser: 1000,
        maxNotificationsPerTenant: 5000,
        suspiciousActivityThreshold: 100,
        timeWindow: 60 * 60 * 1000 // 1 hour
      },
      
      // Webhook security
      webhookSecurity: {
        requireSignature: true,
        signatureAlgorithm: 'sha256',
        maxRetries: 3,
        timeout: 30000 // 30 seconds
      }
    };

    // Suspicious activity tracking
    this.suspiciousActivity = new Map();
    
    // Blocked entities
    this.blockedUsers = new Set();
    this.blockedTenants = new Set();
    this.blockedIPs = new Set();
  }

  /**
   * Validate notification security before processing
   */
  async validateNotificationSecurity(notification, context = {}) {
    try {
      const startTime = Date.now();
      const validationResults = {
        passed: true,
        violations: [],
        warnings: [],
        securityLevel: 'normal'
      };

      // 1. Tenant isolation check
      const tenantCheck = await this.validateTenantIsolation(notification, context);
      if (!tenantCheck.passed) {
        validationResults.passed = false;
        validationResults.violations.push(...tenantCheck.violations);
      }

      // 2. PII protection check
      const piiCheck = await this.validatePIIProtection(notification);
      if (!piiCheck.passed) {
        validationResults.violations.push(...piiCheck.violations);
      }
      validationResults.warnings.push(...piiCheck.warnings);

      // 3. Rate limiting check
      const rateLimitCheck = await this.validateRateLimits(notification, context);
      if (!rateLimitCheck.passed) {
        validationResults.passed = false;
        validationResults.violations.push(...rateLimitCheck.violations);
      }

      // 4. Blocked entity check
      const blockedCheck = await this.validateBlockedEntities(notification, context);
      if (!blockedCheck.passed) {
        validationResults.passed = false;
        validationResults.violations.push(...blockedCheck.violations);
      }

      // 5. Suspicious activity detection
      const suspiciousCheck = await this.detectSuspiciousActivity(notification, context);
      if (suspiciousCheck.suspicious) {
        validationResults.securityLevel = 'high';
        validationResults.warnings.push(...suspiciousCheck.warnings);
      }

      // 6. Content security validation
      const contentCheck = await this.validateContentSecurity(notification);
      validationResults.warnings.push(...contentCheck.warnings);

      const processingTime = Date.now() - startTime;

      // Log security validation
      await this.auditLogger.log({
        action: 'security_validation',
        notificationId: notification._id,
        userId: notification.userId,
        tenantId: notification.tenantId,
        status: validationResults.passed ? 'passed' : 'failed',
        processingTime,
        metadata: {
          violations: validationResults.violations,
          warnings: validationResults.warnings,
          securityLevel: validationResults.securityLevel,
          context: this.sanitizeContext(context)
        }
      });

      return validationResults;

    } catch (error) {
      console.error('❌ Error in security validation:', error);
      
      await this.auditLogger.logSecurityEvent('validation_error', {
        notificationId: notification._id,
        error: error.message
      });
      
      // Fail secure - reject on error
      return {
        passed: false,
        violations: ['security_validation_error'],
        warnings: [],
        securityLevel: 'critical'
      };
    }
  }

  /**
   * Validate tenant isolation
   */
  async validateTenantIsolation(notification, context) {
    const result = { passed: true, violations: [] };
    
    if (!this.securityPolicies.tenantIsolation.enforceStrict) {
      return result;
    }

    // Check if notification has proper tenant context
    if (!notification.tenantId) {
      result.passed = false;
      result.violations.push('missing_tenant_context');
      
      await this.auditLogger.logSecurityEvent('tenant_isolation_violation', {
        notificationId: notification._id,
        violation: 'missing_tenant_context',
        userId: notification.userId
      });
    }

    // Check for cross-tenant access attempts
    if (context.requestingTenantId && 
        notification.tenantId?.toString() !== context.requestingTenantId?.toString()) {
      
      // Check if requesting role is allowed cross-tenant access
      const allowedRoles = this.securityPolicies.tenantIsolation.allowCrossTenantForRoles;
      
      if (!allowedRoles.includes(context.requestingUserRole)) {
        result.passed = false;
        result.violations.push('cross_tenant_access_denied');
        
        await this.auditLogger.logSecurityEvent('cross_tenant_access_attempt', {
          notificationId: notification._id,
          requestingTenantId: context.requestingTenantId,
          targetTenantId: notification.tenantId,
          requestingUserRole: context.requestingUserRole,
          requestingUserId: context.requestingUserId
        });
      } else if (this.securityPolicies.tenantIsolation.logAllCrossTenantAttempts) {
        // Log allowed cross-tenant access for audit
        await this.auditLogger.logSecurityEvent('cross_tenant_access_allowed', {
          notificationId: notification._id,
          requestingTenantId: context.requestingTenantId,
          targetTenantId: notification.tenantId,
          requestingUserRole: context.requestingUserRole,
          requestingUserId: context.requestingUserId
        });
      }
    }

    return result;
  }

  /**
   * Validate PII protection
   */
  async validatePIIProtection(notification) {
    const result = { passed: true, violations: [], warnings: [] };
    
    if (!this.securityPolicies.piiProtection.enabled) {
      return result;
    }

    const blockedFields = this.securityPolicies.piiProtection.blockedFields;
    const strictMode = this.securityPolicies.piiProtection.strictMode;

    // Check notification content for PII
    const contentToCheck = {
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || {}
    };

    // Check for blocked fields
    for (const field of blockedFields) {
      if (this.containsField(contentToCheck, field)) {
        if (strictMode) {
          result.passed = false;
          result.violations.push(`pii_blocked_field_${field}`);
        } else {
          result.warnings.push(`pii_detected_${field}`);
        }
      }
    }

    // Check for PII patterns (SSN, credit card, etc.)
    const piiPatterns = this.detectPIIPatterns(contentToCheck);
    if (piiPatterns.length > 0) {
      if (strictMode) {
        result.passed = false;
        result.violations.push(...piiPatterns.map(p => `pii_pattern_${p}`));
      } else {
        result.warnings.push(...piiPatterns.map(p => `pii_pattern_detected_${p}`));
      }
    }

    return result;
  }

  /**
   * Validate rate limits for security
   */
  async validateRateLimits(notification, context) {
    const result = { passed: true, violations: [] };
    const limits = this.securityPolicies.securityRateLimits;
    const now = Date.now();
    const timeWindow = limits.timeWindow;

    // Check user rate limit
    if (notification.userId) {
      const userKey = `user:${notification.userId}`;
      const userCount = this.getEntityCount(userKey, now, timeWindow);
      
      if (userCount >= limits.maxNotificationsPerUser) {
        result.passed = false;
        result.violations.push('user_rate_limit_exceeded');
        
        await this.auditLogger.logSecurityEvent('rate_limit_exceeded', {
          entityType: 'user',
          entityId: notification.userId,
          count: userCount,
          limit: limits.maxNotificationsPerUser
        });
      }
    }

    // Check tenant rate limit
    if (notification.tenantId) {
      const tenantKey = `tenant:${notification.tenantId}`;
      const tenantCount = this.getEntityCount(tenantKey, now, timeWindow);
      
      if (tenantCount >= limits.maxNotificationsPerTenant) {
        result.passed = false;
        result.violations.push('tenant_rate_limit_exceeded');
        
        await this.auditLogger.logSecurityEvent('rate_limit_exceeded', {
          entityType: 'tenant',
          entityId: notification.tenantId,
          count: tenantCount,
          limit: limits.maxNotificationsPerTenant
        });
      }
    }

    return result;
  }

  /**
   * Validate blocked entities
   */
  async validateBlockedEntities(notification, context) {
    const result = { passed: true, violations: [] };

    // Check blocked users
    if (notification.userId && this.blockedUsers.has(notification.userId.toString())) {
      result.passed = false;
      result.violations.push('user_blocked');
    }

    // Check blocked tenants
    if (notification.tenantId && this.blockedTenants.has(notification.tenantId.toString())) {
      result.passed = false;
      result.violations.push('tenant_blocked');
    }

    // Check blocked IPs
    if (context.ipAddress && this.blockedIPs.has(context.ipAddress)) {
      result.passed = false;
      result.violations.push('ip_blocked');
    }

    return result;
  }

  /**
   * Detect suspicious activity
   */
  async detectSuspiciousActivity(notification, context) {
    const result = { suspicious: false, warnings: [] };
    const threshold = this.securityPolicies.securityRateLimits.suspiciousActivityThreshold;
    const timeWindow = this.securityPolicies.securityRateLimits.timeWindow;
    const now = Date.now();

    // Check for rapid notification creation
    if (notification.userId) {
      const userKey = `user:${notification.userId}`;
      const userCount = this.getEntityCount(userKey, now, timeWindow);
      
      if (userCount >= threshold) {
        result.suspicious = true;
        result.warnings.push('rapid_notification_creation');
        
        await this.auditLogger.logSecurityEvent('suspicious_activity_detected', {
          type: 'rapid_notification_creation',
          userId: notification.userId,
          count: userCount,
          threshold
        });
      }
    }

    // Check for unusual patterns
    const patterns = this.detectUnusualPatterns(notification, context);
    if (patterns.length > 0) {
      result.suspicious = true;
      result.warnings.push(...patterns);
    }

    return result;
  }

  /**
   * Validate content security
   */
  async validateContentSecurity(notification) {
    const result = { warnings: [] };

    // Check for potential XSS
    if (this.containsXSSPatterns(notification.title) || 
        this.containsXSSPatterns(notification.message)) {
      result.warnings.push('potential_xss_content');
    }

    // Check for SQL injection patterns
    if (this.containsSQLInjectionPatterns(notification.title) || 
        this.containsSQLInjectionPatterns(notification.message)) {
      result.warnings.push('potential_sql_injection');
    }

    // Check for malicious URLs
    if (this.containsMaliciousURLs(notification.message)) {
      result.warnings.push('potential_malicious_url');
    }

    return result;
  }

  /**
   * Mask sensitive data in notification
   */
  async maskSensitiveData(notification) {
    if (!this.securityPolicies.dataMasking.enabled) {
      return notification;
    }

    const masked = { ...notification };
    const maskFields = this.securityPolicies.dataMasking.maskFields;
    const maskThreshold = this.securityPolicies.dataMasking.maskThreshold;

    // Mask title and message
    masked.title = this.maskContent(masked.title, maskFields, maskThreshold);
    masked.message = this.maskContent(masked.message, maskFields, maskThreshold);

    // Mask metadata
    if (masked.metadata) {
      masked.metadata = this.maskMetadata(masked.metadata, maskFields, maskThreshold);
    }

    return masked;
  }

  /**
   * Generate secure webhook signature
   */
  generateWebhookSignature(payload, secret) {
    if (!this.securityPolicies.webhookSecurity.requireSignature) {
      return null;
    }

    const algorithm = this.securityPolicies.webhookSecurity.signatureAlgorithm;
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(JSON.stringify(payload));
    
    return `${algorithm}=${hmac.digest('hex')}`;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    if (!this.securityPolicies.webhookSecurity.requireSignature) {
      return true;
    }

    const expectedSignature = this.generateWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Block entities
   */
  async blockUser(userId, reason) {
    this.blockedUsers.add(userId.toString());
    
    await this.auditLogger.logSecurityEvent('user_blocked', {
      userId,
      reason
    });
  }

  async blockTenant(tenantId, reason) {
    this.blockedTenants.add(tenantId.toString());
    
    await this.auditLogger.logSecurityEvent('tenant_blocked', {
      tenantId,
      reason
    });
  }

  async blockIP(ipAddress, reason) {
    this.blockedIPs.add(ipAddress);
    
    await this.auditLogger.logSecurityEvent('ip_blocked', {
      ipAddress,
      reason
    });
  }

  /**
   * Helper methods
   */
  getEntityCount(entityKey, now, timeWindow) {
    if (!this.suspiciousActivity.has(entityKey)) {
      this.suspiciousActivity.set(entityKey, []);
    }
    
    const timestamps = this.suspiciousActivity.get(entityKey);
    
    // Remove old timestamps
    const cutoff = now - timeWindow;
    const recentTimestamps = timestamps.filter(ts => ts > cutoff);
    
    // Add current timestamp
    recentTimestamps.push(now);
    
    // Update the map
    this.suspiciousActivity.set(entityKey, recentTimestamps);
    
    return recentTimestamps.length;
  }

  containsField(content, field) {
    const contentStr = JSON.stringify(content).toLowerCase();
    return contentStr.includes(field.toLowerCase());
  }

  detectPIIPatterns(content) {
    const patterns = [];
    const contentStr = JSON.stringify(content);

    // SSN pattern
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(contentStr)) {
      patterns.push('ssn');
    }

    // Credit card pattern
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(contentStr)) {
      patterns.push('credit_card');
    }

    // Phone pattern
    if (/\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(contentStr)) {
      patterns.push('phone');
    }

    // Email pattern
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(contentStr)) {
      patterns.push('email');
    }

    return patterns;
  }

  detectUnusualPatterns(notification, context) {
    const patterns = [];

    // Check for off-hours activity
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      patterns.push('off_hours_activity');
    }

    // Check for unusual event types
    if (notification.eventType && notification.eventType.includes('test')) {
      patterns.push('test_event_in_production');
    }

    return patterns;
  }

  containsXSSPatterns(content) {
    if (!content) return false;
    
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i
    ];
    
    return xssPatterns.some(pattern => pattern.test(content));
  }

  containsSQLInjectionPatterns(content) {
    if (!content) return false;
    
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i
    ];
    
    return sqlPatterns.some(pattern => pattern.test(content));
  }

  containsMaliciousURLs(content) {
    if (!content) return false;
    
    // This would integrate with threat intelligence feeds
    const suspiciousDomains = [
      'bit.ly',
      'tinyurl.com',
      // Add more suspicious domains
    ];
    
    return suspiciousDomains.some(domain => content.includes(domain));
  }

  maskContent(content, maskFields, maskThreshold) {
    if (!content) return content;
    
    let masked = content;
    
    // Mask phone numbers
    masked = masked.replace(/\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, 'XXX-XXX-XXXX');
    
    // Mask email addresses
    masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'xxx@xxx.com');
    
    // Mask amounts over threshold
    if (maskThreshold.amount) {
      masked = masked.replace(/\$(\d{4,})/g, '$***');
    }
    
    return masked;
  }

  maskMetadata(metadata, maskFields, maskThreshold) {
    const masked = { ...metadata };
    
    for (const field of maskFields) {
      if (masked[field]) {
        if (field === 'amount' && masked[field] > maskThreshold.amount) {
          masked[field] = '***MASKED***';
        } else if (maskThreshold[field] === true) {
          masked[field] = '***MASKED***';
        }
      }
    }
    
    return masked;
  }

  sanitizeContext(context) {
    const sanitized = { ...context };
    
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.apiKey;
    
    return sanitized;
  }

  /**
   * Get security statistics
   */
  async getSecurityStatistics() {
    return {
      blockedEntities: {
        users: this.blockedUsers.size,
        tenants: this.blockedTenants.size,
        ips: this.blockedIPs.size
      },
      suspiciousActivity: this.suspiciousActivity.size,
      policies: this.securityPolicies
    };
  }

  /**
   * Update security policies
   */
  updateSecurityPolicies(newPolicies) {
    this.securityPolicies = { ...this.securityPolicies, ...newPolicies };
    
    console.log('✅ Security policies updated');
    
    this.auditLogger.logSecurityEvent('policies_updated', {
      updatedPolicies: Object.keys(newPolicies)
    });
  }
}

module.exports = { NotificationSecurityGuard };