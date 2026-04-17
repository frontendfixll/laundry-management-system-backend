# SuperAdmin Roles aur Permissions Documentation

## Overview

LaundryLobby platform mein SuperAdmin level par teen main roles hain jo platform operations ko manage karte hain:

1. **Platform Finance Admin** - Financial operations aur revenue management
2. **Platform Support** - Customer support aur tenant assistance
3. **Platform Sales** - Sales operations aur lead management

Yeh document in teeno roles ke permissions, responsibilities, aur access levels ko detail mein explain karta hai.

---

## 1. Platform Finance Admin

### Role Information
- **Role Name**: Platform Finance Admin
- **Slug**: `platform-finance-admin`
- **Color**: Green (#059669)
- **Description**: Financial operations aur revenue management ke liye responsible

### Permissions

#### ✅ Full Access (Read, Create, Update, Export)

**Payments & Revenue** (`payments_revenue: 'rcue'`)
- Payment transactions view kar sakte hain
- Payment records create kar sakte hain
- Payment details update kar sakte hain
- Payment reports export kar sakte hain
- ❌ Payment records delete nahi kar sakte (security ke liye)

**Refunds** (`refunds: 'rcue'`)
- Refund requests view kar sakte hain
- Refund requests create kar sakte hain
- Refund status update kar sakte hain
- Refund reports export kar sakte hain
- ❌ Refund records delete nahi kar sakte (audit trail ke liye)

**Audit Logs** (`audit_logs: 're'`)
- System audit logs view kar sakte hain
- Audit reports export kar sakte hain
- Financial transactions ki complete audit trail access

#### 📊 Read & Export Access

**Subscription Plans** (`subscription_plans: 're'`)
- Subscription plans view kar sakte hain
- Plan details aur pricing dekh sakte hain
- Subscription reports export kar sakte hain
- ❌ Plans create, update, ya delete nahi kar sakte

**View All Orders** (`view_all_orders: 're'`)
- Platform ke saare orders view kar sakte hain
- Order details aur payment status dekh sakte hain
- Order reports export kar sakte hain
- ❌ Orders modify nahi kar sakte

**Leads** (`leads: 'r'`)
- Sales leads view kar sakte hain (read-only)
- Lead information dekh sakte hain
- ❌ Leads manage nahi kar sakte

#### ❌ No Access

- Platform Settings
- Tenant CRUD operations
- Tenant Suspend/Activate
- Marketplace Control
- Platform Coupons
- User Impersonation

### Key Responsibilities

1. **Revenue Management**
   - Platform revenue tracking aur monitoring
   - Payment reconciliation
   - Financial reports generation

2. **Refund Processing**
   - Refund requests review karna
   - Refund approvals processing
   - Refund tracking aur reporting

3. **Financial Reporting**
   - Monthly/quarterly financial reports
   - Revenue analytics
   - Payment trends analysis

4. **Audit Compliance**
   - Financial audit logs review
   - Compliance monitoring
   - Transaction verification

### Security Rules

- **Financial Separation**: Sirf finance roles hi financial operations perform kar sakte hain
- **No Delete Access**: Financial records delete nahi kar sakte (audit trail protection)
- **Read-Only on Plans**: Subscription plans sirf view kar sakte hain, modify nahi
- **Audit Trail**: Saare actions audit logs mein record hote hain

---

## 2. Platform Support

### Role Information
- **Role Name**: Platform Support
- **Slug**: `platform-support`
- **Color**: Blue (#2563eb)
- **Description**: Support operations with limited tenant access

### Permissions

#### 📖 Read-Only Access

**Tenant CRUD** (`tenant_crud: 'r'`)
- Tenant information view kar sakte hain
- Tenant details dekh sakte hain
- ❌ Tenants create, update, ya delete nahi kar sakte

**Tenant Suspend** (`tenant_suspend: 'r'`)
- Tenant suspension status view kar sakte hain
- ❌ Tenants suspend/activate nahi kar sakte

**Marketplace Control** (`marketplace_control: 'r'`)
- Marketplace settings view kar sakte hain
- ❌ Marketplace modify nahi kar sakte

**View All Orders** (`view_all_orders: 'r'`)
- Platform ke saare orders view kar sakte hain
- Order details aur status dekh sakte hain
- ❌ Orders modify nahi kar sakte

**Audit Logs** (`audit_logs: 'r'`)
- System audit logs view kar sakte hain
- Support actions ki history dekh sakte hain
- ❌ Audit logs export nahi kar sakte

#### ✅ Full Access (Read & Export)

**Leads** (`leads: 're'`)
- Sales leads view kar sakte hain
- Lead information manage kar sakte hain
- Lead reports export kar sakte hain

#### 🔐 Special Access

**User Impersonation** (`user_impersonation: 'r'`)
- Tenant users ko impersonate kar sakte hain (support ke liye)
- Read-only mode mein tenant account access
- Time-limited access (30 minutes max)
- Saare impersonation actions logged hote hain
- Tenant ko notification milti hai

#### ❌ No Access

- Platform Settings
- Subscription Plans
- Payments & Revenue
- Refunds
- Marketplace Control (modify)
- Platform Coupons

### Key Responsibilities

1. **Customer Support**
   - Tenant queries resolve karna
   - Technical issues troubleshoot karna
   - Account-related support provide karna

2. **Issue Resolution**
   - Order issues investigate karna
   - Tenant problems diagnose karna
   - Support tickets handle karna

3. **User Assistance**
   - Tenant onboarding help
   - Feature guidance provide karna
   - Platform usage training

4. **Impersonation Support**
   - Tenant issues ko directly investigate karna
   - Read-only mode mein tenant account access
   - Issue reproduction aur debugging

### Security Rules

- **Read-Only Enforcement**: Write operations allowed nahi hain
- **Impersonation Restrictions**:
  - Read-only access during impersonation
  - Time-limited (30 minutes max)
  - Fully logged and audited
  - Tenant notification mandatory
- **No Financial Access**: Payment aur revenue data access nahi hai
- **Audit Trail**: Saare support actions logged hote hain

---

## 3. Platform Sales

### Role Information
- **Role Name**: Platform Sales
- **Slug**: `platform-sales`
- **Color**: Pink (#ec4899)
- **Description**: Sales and lead management

### Permissions

#### ✅ Full Access (Read, Create, Update, Delete, Export)

**Leads** (`leads: 'rcude'`)
- Sales leads view kar sakte hain
- New leads create kar sakte hain
- Lead information update kar sakte hain
- Leads delete kar sakte hain
- Lead reports export kar sakte hain

#### 📊 Read & Export Access

**Subscription Plans** (`subscription_plans: 're'`)
- Subscription plans view kar sakte hain
- Plan details aur pricing dekh sakte hain
- Plan reports export kar sakte hain
- ❌ Plans modify nahi kar sakte

**Payments Revenue** (`payments_revenue: 'r'`)
- Payment information view kar sakte hain (read-only)
- Revenue data dekh sakte hain
- ❌ Payments modify ya export nahi kar sakte

#### ❌ No Access

- Platform Settings
- Tenant CRUD operations
- Tenant Suspend/Activate
- Refunds
- Marketplace Control
- Platform Coupons
- Audit Logs
- User Impersonation

### Key Responsibilities

1. **Lead Management**
   - New leads capture karna
   - Lead qualification
   - Lead nurturing aur follow-up

2. **Sales Operations**
   - Sales pipeline management
   - Conversion tracking
   - Sales reporting

3. **Customer Acquisition**
   - New tenant onboarding
   - Demo scheduling
   - Sales presentations

4. **Revenue Planning**
   - Subscription plan recommendations
   - Pricing discussions
   - Revenue forecasting

### Security Rules

- **Limited Financial Access**: Sirf read-only payment access
- **No Tenant Management**: Tenant operations allowed nahi hain
- **Lead-Focused**: Primary focus leads aur sales operations par
- **Audit Trail**: Saare sales actions logged hote hain

---

## Additional Sales Roles

### Platform Sales Junior

**Role Name**: Platform Sales Junior  
**Slug**: `platform-sales-junior`  
**Color**: Orange (#f97316)

**Permissions**:
- **Leads**: Full access (`rcude`)
- **Subscription Plans**: Read & Export (`re`)
- ❌ No payment access

**Use Case**: Entry-level sales team members ke liye

### Platform Sales Senior

**Role Name**: Platform Sales Senior  
**Slug**: `platform-sales-senior`  
**Color**: Violet (#8b5cf6)

**Permissions**:
- **Leads**: Full access (`rcude`)
- **Subscription Plans**: Read & Export (`re`)
- **Payments Revenue**: Read-only (`r`)
- **Audit Logs**: Read & Export (`re`)
- **Tenant CRUD**: Read-only (`r`)

**Use Case**: Senior sales team members with additional oversight

---

## Permission Code Reference

### Permission Actions

| Code | Action | Description |
|------|--------|-------------|
| `r` | Read/View | Data view kar sakte hain |
| `c` | Create | New records create kar sakte hain |
| `u` | Update | Existing records modify kar sakte hain |
| `d` | Delete | Records delete kar sakte hain |
| `e` | Export | Data export kar sakte hain |

### Permission String Examples

- `'rcude'` = Full access (Read, Create, Update, Delete, Export)
- `'rcue'` = Full access except Delete
- `'re'` = Read & Export only
- `'r'` = Read-only
- `''` = No access

---

## Security & Compliance

### Financial Separation Rule

**Rule**: Sirf Finance roles hi financial operations perform kar sakte hain

**Affected Actions**:
- `payments_earnings`
- `refund_requests`
- `view_bank_data`
- `process_payouts`

**Enforcement**: Non-finance roles in actions ko perform nahi kar sakte

### Read-Only Enforcement

**Read-Only Roles**:
- Platform Auditor
- Platform Support (mostly)

**Restriction**: Write operations (create, update, delete) allowed nahi hain

### Audit Logging

**Logged Actions**:
- Saare permission checks
- Role assignments
- Permission changes
- User impersonation
- Financial operations
- Tenant modifications

**Log Details**:
- User email aur ID
- Action performed
- Timestamp
- IP address
- User agent
- Session ID
- Risk level

---

## Role Assignment Process

### 1. Role Creation
```javascript
// Default roles automatically created hain
// Custom roles bhi create kar sakte hain
```

### 2. Role Assignment to User
```javascript
// SuperAdmin ko role assign karna
POST /api/superadmin/roles/assign
{
  "userId": "superadmin_id",
  "roleId": "role_id"
}
```

### 3. Permission Verification
```javascript
// Permission check middleware
requirePermission('module_name', 'action')
```

---

## API Endpoints

### Role Management

```
GET    /api/superadmin/roles              # All roles list
GET    /api/superadmin/roles/:roleId      # Single role details
POST   /api/superadmin/roles              # Create new role
PUT    /api/superadmin/roles/:roleId      # Update role
DELETE /api/superadmin/roles/:roleId      # Delete role
POST   /api/superadmin/roles/assign       # Assign role to user
```

### Permission Management

```
POST   /api/superadmin/roles/:roleId/permissions     # Add permission
DELETE /api/superadmin/roles/:roleId/permissions     # Remove permission
```

---

## Best Practices

### 1. Principle of Least Privilege
- Users ko sirf required permissions hi dein
- Unnecessary access avoid karein
- Regular permission audits karein

### 2. Role Segregation
- Finance aur Support roles ko separate rakhein
- Conflicting permissions avoid karein
- Clear role boundaries maintain karein

### 3. Audit Trail
- Saare critical actions log karein
- Regular audit log reviews karein
- Suspicious activities monitor karein

### 4. Regular Reviews
- Quarterly role permission reviews
- User access audits
- Inactive user cleanup

---

## Troubleshooting

### Permission Denied Error

**Error**: `Permission denied: module.action`

**Solution**:
1. User ke assigned roles check karein
2. Role ke permissions verify karein
3. Custom permission overrides check karein
4. Audit logs review karein

### Role Assignment Issues

**Problem**: Role assign nahi ho raha

**Solution**:
1. User ID aur Role ID verify karein
2. User active hai ya nahi check karein
3. Role active hai ya nahi check karein
4. Database connection verify karein

### Impersonation Not Working

**Problem**: User impersonation fail ho raha hai

**Solution**:
1. Platform Support role assigned hai ya nahi check karein
2. Target user active hai ya nahi verify karein
3. Session timeout check karein
4. Audit logs review karein

---

## Migration & Initialization

### Initialize Roles System

```bash
# All roles initialize karne ke liye
node src/scripts/initializeRolesSystem.js

# Sirf platform roles
node src/scripts/initializeRolesSystem.js --platform-only

# System validate karne ke liye
node src/scripts/initializeRolesSystem.js --validate-only
```

### Assign Default Roles

```bash
# Existing users ko default roles assign karna
node src/scripts/initializeRolesSystem.js --assign-only
```

---

## Contact & Support

Role aur permission related issues ke liye:
- Technical Team se contact karein
- Audit logs review karein
- Documentation refer karein

---

**Document Version**: 1.0  
**Last Updated**: February 2026  
**Maintained By**: LaundryLobby Platform Team
