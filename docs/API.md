# Laundry Management System - Complete API Documentation

**Base URL:** `http://localhost:5000/api` or your deployed URL  
**Version:** 2.0.1  
**Last Updated:** 2024

---

## Table of Contents

1. [Authentication](#authentication)
2. [Public Routes](#public-routes)
3. [Customer APIs](#customer-apis)
4. [Admin APIs](#admin-apis)
5. [Center Admin APIs](#center-admin-apis)
6. [SuperAdmin APIs](#superadmin-apis)
7. [Support APIs](#support-apis)
8. [Sales APIs](#sales-apis)
9. [Add-on APIs](#add-on-apis)
10. [Blog APIs](#blog-apis)
11. [Webhook & Automation](#webhook--automation)

---

## Authentication

All authenticated routes require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Cookie-based Authentication
Some routes also support cookie-based authentication with credentials.

---

## 1. Authentication APIs

### Base Path: `/api/auth`

#### 1.1 Register User
**POST** `/api/auth/register`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone": "9876543210",
  "role": "customer"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": {
    "user": {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "role": "customer",
      "isEmailVerified": false
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 1.2 Login
**POST** `/api/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": true,
      "tenancy": {
        "_id": "64a1b2c3d4e5f6789012346",
        "name": "QuickWash Laundry",
        "slug": "quickwash"
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 1.3 Verify Email
**POST** `/api/auth/verify-email`

**Request Body:**
```json
{
  "token": "verification_token_here"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

#### 1.4 Resend Verification Email
**POST** `/api/auth/resend-verification`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

#### 1.5 Get Profile
**GET** `/api/auth/profile`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "role": "customer",
      "isEmailVerified": true,
      "tenancy": {
        "_id": "64a1b2c3d4e5f6789012346",
        "name": "QuickWash Laundry"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

#### 1.6 Update Profile
**PUT** `/api/auth/profile`  
**Auth Required:** Yes

**Request Body:**
```json
{
  "name": "John Updated",
  "phone": "9876543211"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Updated",
      "email": "john@example.com",
      "phone": "9876543211"
    }
  }
}
```

#### 1.7 Logout
**POST** `/api/auth/logout`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 2. Public Routes

### 2.1 Health Check
**GET** `/health` or `/api/health`

**Response (200):**
```json
{
  "success": true,
  "message": "Laundry Management API is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "production",
  "version": "2.0.0",
  "platform": "vercel",
  "env_check": {
    "mongodb_uri": true,
    "jwt_secret": true,
    "frontend_url": true,
    "vercel": true
  }
}
```

### 2.2 Track Order (Public)
**GET** `/api/orders/track/:orderNumber`

**Example:** `/api/orders/track/ORD-2024-001`

**Response (200):**
```json
{
  "success": true,
  "message": "Order found",
  "data": {
    "order": {
      "orderNumber": "ORD-2024-001",
      "status": "processing",
      "customer": {
        "name": "John Doe",
        "phone": "98****3210"
      },
      "items": [
        {
          "itemType": "Shirt",
          "service": "wash_fold",
          "quantity": 5,
          "totalPrice": 250
        }
      ],
      "pricing": {
        "subtotal": 250,
        "deliveryCharge": 50,
        "expressCharge": 0,
        "discount": 0,
        "total": 300
      },
      "pickupDate": "2024-01-15T10:00:00.000Z",
      "estimatedDeliveryDate": "2024-01-17T18:00:00.000Z",
      "pickupAddress": {
        "addressLine1": "123 Main Street",
        "city": "Mumbai",
        "pincode": "400001"
      },
      "isExpress": false,
      "paymentStatus": "paid",
      "branch": {
        "name": "Downtown Branch"
      },
      "createdAt": "2024-01-15T09:00:00.000Z"
    }
  }
}
```

### 2.3 Get Homepage Stats
**GET** `/api/stats/homepage`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalOrders": 15420,
    "activeCustomers": 3250,
    "totalBranches": 12,
    "averageRating": 4.7,
    "servicesOffered": 8
  }
}
```

### 2.4 Get Service Types
**GET** `/api/services/types`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "serviceTypes": [
      {
        "id": "full_service",
        "name": "Full Service",
        "description": "We pickup, wash, and deliver"
      },
      {
        "id": "self_drop_self_pickup",
        "name": "Self Drop & Pickup",
        "description": "Drop off and pick up yourself"
      },
      {
        "id": "self_drop_home_delivery",
        "name": "Self Drop, Home Delivery",
        "description": "Drop off yourself, we deliver"
      },
      {
        "id": "home_pickup_self_pickup",
        "name": "Home Pickup, Self Pickup",
        "description": "We pickup, you collect"
      }
    ]
  }
}
```

### 2.5 Check Service Availability
**GET** `/api/services/availability/:pincode`

**Example:** `/api/services/availability/400001`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "available": true,
    "pincode": "400001",
    "branches": [
      {
        "_id": "64a1b2c3d4e5f6789012347",
        "name": "Downtown Branch",
        "distance": 2.5,
        "estimatedPickupTime": "2-3 hours"
      }
    ]
  }
}
```

### 2.6 Get Available Time Slots
**GET** `/api/services/time-slots?date=2024-01-15&pincode=400001`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "slots": [
      {
        "id": "morning",
        "label": "Morning (9 AM - 12 PM)",
        "available": true
      },
      {
        "id": "afternoon",
        "label": "Afternoon (12 PM - 3 PM)",
        "available": true
      },
      {
        "id": "evening",
        "label": "Evening (3 PM - 6 PM)",
        "available": false
      }
    ]
  }
}
```

### 2.7 Calculate Pricing
**POST** `/api/services/calculate`

**Request Body:**
```json
{
  "items": [
    {
      "itemType": "Shirt",
      "service": "wash_fold",
      "quantity": 5
    },
    {
      "itemType": "Jeans",
      "service": "dry_cleaning",
      "quantity": 2
    }
  ],
  "serviceType": "full_service",
  "isExpress": false,
  "pincode": "400001"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pricing": {
      "subtotal": 450,
      "deliveryCharge": 50,
      "expressCharge": 0,
      "tax": 45,
      "discount": 0,
      "total": 545
    },
    "itemBreakdown": [
      {
        "itemType": "Shirt",
        "service": "wash_fold",
        "quantity": 5,
        "pricePerUnit": 50,
        "totalPrice": 250
      },
      {
        "itemType": "Jeans",
        "service": "dry_cleaning",
        "quantity": 2,
        "pricePerUnit": 100,
        "totalPrice": 200
      }
    ]
  }
}
```

### 2.8 Get Public Pricing
**GET** `/api/services/pricing`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "category": "wash_fold",
        "name": "Wash & Fold",
        "items": [
          {
            "name": "Shirt",
            "price": 50,
            "unit": "per_piece"
          },
          {
            "name": "T-Shirt",
            "price": 40,
            "unit": "per_piece"
          }
        ]
      },
      {
        "category": "dry_cleaning",
        "name": "Dry Cleaning",
        "items": [
          {
            "name": "Suit",
            "price": 300,
            "unit": "per_piece"
          }
        ]
      }
    ]
  }
}
```

### 2.9 Get Tenancy Public Info
**GET** `/api/public/tenancy/:slug` or `/api/tenancy/:slug`

**Example:** `/api/public/tenancy/quickwash`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tenancy": {
      "_id": "64a1b2c3d4e5f6789012346",
      "name": "QuickWash Laundry",
      "slug": "quickwash",
      "subdomain": "quickwash",
      "branding": {
        "logo": "https://example.com/logo.png",
        "primaryColor": "#007bff",
        "secondaryColor": "#6c757d",
        "tagline": "Fast, Fresh, Fabulous!"
      },
      "contact": {
        "email": "support@quickwash.com",
        "phone": "1800-123-4567"
      },
      "isActive": true
    }
  }
}
```

---

## 3. Customer APIs

### Base Path: `/api/customer`
**Auth Required:** Yes (Customer role)

### 3.1 Address Management

#### 3.1.1 Get All Addresses
**GET** `/api/customer/addresses`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "_id": "64a1b2c3d4e5f6789012348",
        "name": "Home",
        "phone": "9876543210",
        "addressLine1": "123 Main Street",
        "addressLine2": "Apt 4B",
        "landmark": "Near City Mall",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "isDefault": true
      },
      {
        "_id": "64a1b2c3d4e5f6789012349",
        "name": "Office",
        "phone": "9876543210",
        "addressLine1": "456 Business Park",
        "city": "Mumbai",
        "pincode": "400002",
        "isDefault": false
      }
    ]
  }
}
```

#### 3.1.2 Add Address
**POST** `/api/customer/addresses`

**Request Body:**
```json
{
  "name": "Home",
  "phone": "9876543210",
  "addressLine1": "123 Main Street",
  "addressLine2": "Apt 4B",
  "landmark": "Near City Mall",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "isDefault": true
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Address added successfully",
  "data": {
    "address": {
      "_id": "64a1b2c3d4e5f6789012348",
      "name": "Home",
      "phone": "9876543210",
      "addressLine1": "123 Main Street",
      "addressLine2": "Apt 4B",
      "landmark": "Near City Mall",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "isDefault": true
    }
  }
}
```

#### 3.1.3 Update Address
**PUT** `/api/customer/addresses/:id`

**Request Body:**
```json
{
  "addressLine2": "Apt 5C",
  "landmark": "Near New Mall"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Address updated successfully",
  "data": {
    "address": {
      "_id": "64a1b2c3d4e5f6789012348",
      "addressLine2": "Apt 5C",
      "landmark": "Near New Mall"
    }
  }
}
```

#### 3.1.4 Delete Address
**DELETE** `/api/customer/addresses/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```

#### 3.1.5 Set Default Address
**PUT** `/api/customer/addresses/:id/set-default`

**Response (200):**
```json
{
  "success": true,
  "message": "Default address updated"
}
```

### 3.2 Order Management

#### 3.2.1 Create Order
**POST** `/api/customer/orders`

**Request Body:**
```json
{
  "serviceType": "full_service",
  "pickupAddressId": "64a1b2c3d4e5f6789012348",
  "deliveryAddressId": "64a1b2c3d4e5f6789012348",
  "pickupDate": "2024-01-15",
  "pickupTimeSlot": "morning",
  "items": [
    {
      "itemType": "Shirt",
      "service": "wash_fold",
      "quantity": 5
    }
  ],
  "isExpress": false,
  "couponCode": "FIRST50",
  "paymentMethod": "online",
  "specialInstructions": "Handle with care"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "_id": "64a1b2c3d4e5f678901234a",
      "orderNumber": "ORD-2024-001",
      "status": "pending",
      "customer": "64a1b2c3d4e5f6789012345",
      "serviceType": "full_service",
      "pickupDate": "2024-01-15T09:00:00.000Z",
      "estimatedDeliveryDate": "2024-01-17T18:00:00.000Z",
      "pricing": {
        "subtotal": 250,
        "deliveryCharge": 50,
        "discount": 50,
        "total": 250
      },
      "paymentStatus": "pending",
      "createdAt": "2024-01-14T10:00:00.000Z"
    }
  }
}
```

#### 3.2.2 Get All Orders
**GET** `/api/customer/orders?page=1&limit=10&status=pending`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `status` (optional): Filter by status (pending, confirmed, processing, ready, delivered, cancelled)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "_id": "64a1b2c3d4e5f678901234a",
        "orderNumber": "ORD-2024-001",
        "status": "processing",
        "serviceType": "full_service",
        "pickupDate": "2024-01-15T09:00:00.000Z",
        "estimatedDeliveryDate": "2024-01-17T18:00:00.000Z",
        "pricing": {
          "total": 250
        },
        "paymentStatus": "paid",
        "createdAt": "2024-01-14T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalOrders": 48,
      "hasMore": true
    }
  }
}
```

#### 3.2.3 Get Order by ID
**GET** `/api/customer/orders/:orderId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "64a1b2c3d4e5f678901234a",
      "orderNumber": "ORD-2024-001",
      "barcode": "BAR-2024-001",
      "status": "processing",
      "serviceType": "full_service",
      "customer": {
        "_id": "64a1b2c3d4e5f6789012345",
        "name": "John Doe",
        "phone": "9876543210"
      },
      "branch": {
        "_id": "64a1b2c3d4e5f6789012347",
        "name": "Downtown Branch"
      },
      "pickupAddress": {
        "name": "Home",
        "phone": "9876543210",
        "addressLine1": "123 Main Street",
        "city": "Mumbai",
        "pincode": "400001"
      },
      "deliveryAddress": {
        "name": "Home",
        "phone": "9876543210",
        "addressLine1": "123 Main Street",
        "city": "Mumbai",
        "pincode": "400001"
      },
      "pickupDate": "2024-01-15T09:00:00.000Z",
      "estimatedDeliveryDate": "2024-01-17T18:00:00.000Z",
      "items": [
        {
          "_id": "64a1b2c3d4e5f678901234b",
          "itemType": "Shirt",
          "service": "wash_fold",
          "quantity": 5,
          "pricePerUnit": 50,
          "totalPrice": 250
        }
      ],
      "pricing": {
        "subtotal": 250,
        "deliveryCharge": 50,
        "expressCharge": 0,
        "discount": 50,
        "couponDiscount": 50,
        "tax": 25,
        "total": 275
      },
      "paymentMethod": "online",
      "paymentStatus": "paid",
      "isExpress": false,
      "specialInstructions": "Handle with care",
      "statusHistory": [
        {
          "status": "pending",
          "timestamp": "2024-01-14T10:00:00.000Z",
          "note": "Order placed"
        },
        {
          "status": "confirmed",
          "timestamp": "2024-01-14T10:30:00.000Z",
          "note": "Order confirmed"
        }
      ],
      "createdAt": "2024-01-14T10:00:00.000Z",
      "updatedAt": "2024-01-14T10:30:00.000Z"
    }
  }
}
```

#### 3.2.4 Get Order Tracking
**GET** `/api/customer/orders/:orderId/tracking`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tracking": {
      "orderNumber": "ORD-2024-001",
      "currentStatus": "processing",
      "timeline": [
        {
          "status": "pending",
          "label": "Order Placed",
          "timestamp": "2024-01-14T10:00:00.000Z",
          "completed": true
        },
        {
          "status": "confirmed",
          "label": "Order Confirmed",
          "timestamp": "2024-01-14T10:30:00.000Z",
          "completed": true
        },
        {
          "status": "picked_up",
          "label": "Picked Up",
          "timestamp": "2024-01-15T09:30:00.000Z",
          "completed": true
        },
        {
          "status": "processing",
          "label": "In Processing",
          "timestamp": "2024-01-15T11:00:00.000Z",
          "completed": true
        },
        {
          "status": "ready",
          "label": "Ready for Delivery",
          "timestamp": null,
          "completed": false
        },
        {
          "status": "out_for_delivery",
          "label": "Out for Delivery",
          "timestamp": null,
          "completed": false
        },
        {
          "status": "delivered",
          "label": "Delivered",
          "timestamp": null,
          "completed": false
        }
      ],
      "estimatedDelivery": "2024-01-17T18:00:00.000Z"
    }
  }
}
```

#### 3.2.5 Cancel Order
**PUT** `/api/customer/orders/:orderId/cancel`

**Request Body:**
```json
{
  "reason": "Changed my mind"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order cancelled successfully",
  "data": {
    "order": {
      "_id": "64a1b2c3d4e5f678901234a",
      "orderNumber": "ORD-2024-001",
      "status": "cancelled",
      "cancellationReason": "Changed my mind"
    }
  }
}
```

#### 3.2.6 Rate Order
**PUT** `/api/customer/orders/:orderId/rate`

**Request Body:**
```json
{
  "rating": 5,
  "review": "Excellent service! Very satisfied.",
  "serviceQuality": 5,
  "deliveryTime": 5,
  "packaging": 5
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Rating submitted successfully",
  "data": {
    "rating": {
      "_id": "64a1b2c3d4e5f678901234c",
      "order": "64a1b2c3d4e5f678901234a",
      "rating": 5,
      "review": "Excellent service! Very satisfied.",
      "serviceQuality": 5,
      "deliveryTime": 5,
      "packaging": 5
    }
  }
}
```

#### 3.2.7 Reorder
**POST** `/api/customer/orders/:orderId/reorder`

**Request Body:**
```json
{
  "pickupDate": "2024-01-20",
  "pickupTimeSlot": "morning"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "_id": "64a1b2c3d4e5f678901234d",
      "orderNumber": "ORD-2024-002",
      "status": "pending"
    }
  }
}
```

### 3.3 Coupon Management

#### 3.3.1 Validate Coupon
**POST** `/api/customer/coupons/validate`

**Request Body:**
```json
{
  "couponCode": "FIRST50",
  "orderValue": 500
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "coupon": {
      "code": "FIRST50",
      "discountType": "percentage",
      "discountValue": 10,
      "maxDiscount": 100,
      "minOrderValue": 300
    },
    "discountAmount": 50,
    "finalAmount": 450
  }
}
```

#### 3.3.2 Get Available Coupons
**GET** `/api/customer/coupons/available`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "coupons": [
      {
        "_id": "64a1b2c3d4e5f678901234e",
        "code": "FIRST50",
        "title": "First Order Discount",
        "description": "Get 10% off on your first order",
        "discountType": "percentage",
        "discountValue": 10,
        "maxDiscount": 100,
        "minOrderValue": 300,
        "validFrom": "2024-01-01T00:00:00.000Z",
        "validUntil": "2024-12-31T23:59:59.000Z",
        "isActive": true
      }
    ]
  }
}
```

### 3.4 Loyalty & Rewards

#### 3.4.1 Get Loyalty Balance
**GET** `/api/customer/loyalty/balance`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "balance": 1250,
    "tier": "Gold",
    "nextTier": "Platinum",
    "pointsToNextTier": 750
  }
}
```

#### 3.4.2 Get Loyalty Transactions
**GET** `/api/customer/loyalty/transactions?page=1&limit=10`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "64a1b2c3d4e5f678901234f",
        "type": "earned",
        "points": 50,
        "description": "Order ORD-2024-001",
        "orderId": "64a1b2c3d4e5f678901234a",
        "createdAt": "2024-01-15T10:00:00.000Z"
      },
      {
        "_id": "64a1b2c3d4e5f6789012350",
        "type": "redeemed",
        "points": -100,
        "description": "Redeemed for discount",
        "createdAt": "2024-01-14T15:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "total": 28
    }
  }
}
```

#### 3.4.3 Redeem Points
**POST** `/api/customer/loyalty/redeem`

**Request Body:**
```json
{
  "points": 100,
  "rewardId": "64a1b2c3d4e5f6789012351"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Points redeemed successfully",
  "data": {
    "redemption": {
      "_id": "64a1b2c3d4e5f6789012352",
      "points": 100,
      "reward": {
        "name": "₹50 Discount Voucher",
        "value": 50
      },
      "voucherCode": "LOYALTY-ABC123",
      "expiresAt": "2024-02-15T23:59:59.000Z"
    },
    "newBalance": 1150
  }
}
```

### 3.5 Wallet Management

#### 3.5.1 Get Wallet Balance
**GET** `/api/customer/wallet/balance`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "balance": 500,
    "currency": "INR"
  }
}
```

#### 3.5.2 Get Wallet Transactions
**GET** `/api/customer/wallet/transactions?page=1&limit=10`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "64a1b2c3d4e5f6789012353",
        "type": "credit",
        "amount": 500,
        "description": "Added money to wallet",
        "paymentMethod": "upi",
        "status": "completed",
        "createdAt": "2024-01-15T10:00:00.000Z"
      },
      {
        "_id": "64a1b2c3d4e5f6789012354",
        "type": "debit",
        "amount": 250,
        "description": "Payment for order ORD-2024-001",
        "orderId": "64a1b2c3d4e5f678901234a",
        "status": "completed",
        "createdAt": "2024-01-14T12:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "total": 15
    }
  }
}
```

#### 3.5.3 Add Money to Wallet
**POST** `/api/customer/wallet/add`

**Request Body:**
```json
{
  "amount": 500,
  "paymentMethod": "upi"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Money added successfully",
  "data": {
    "transaction": {
      "_id": "64a1b2c3d4e5f6789012353",
      "amount": 500,
      "status": "completed"
    },
    "newBalance": 1000
  }
}
```

### 3.6 Referral Program

#### 3.6.1 Get Referral Code
**GET** `/api/customer/referrals/code`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "referralCode": "JOHN-REF-2024",
    "referralLink": "https://quickwash.com/signup?ref=JOHN-REF-2024",
    "reward": {
      "referrer": 100,
      "referee": 50
    }
  }
}
```

#### 3.6.2 Get Referral Stats
**GET** `/api/customer/referrals/stats`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalReferrals": 15,
    "successfulReferrals": 12,
    "pendingReferrals": 3,
    "totalEarnings": 1200,
    "referrals": [
      {
        "name": "Jane Doe",
        "status": "completed",
        "reward": 100,
        "joinedAt": "2024-01-10T10:00:00.000Z"
      }
    ]
  }
}
```

### 3.7 Support Tickets

#### 3.7.1 Get Ticket Categories
**GET** `/api/customer/tickets/categories`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "order_issue",
        "name": "Order Issue",
        "description": "Problems with your order"
      },
      {
        "id": "payment_issue",
        "name": "Payment Issue",
        "description": "Payment related queries"
      },
      {
        "id": "quality_complaint",
        "name": "Quality Complaint",
        "description": "Service quality concerns"
      },
      {
        "id": "general_inquiry",
        "name": "General Inquiry",
        "description": "General questions"
      }
    ]
  }
}
```

#### 3.7.2 Create Ticket
**POST** `/api/customer/tickets`

**Request Body:**
```json
{
  "title": "Order not delivered on time",
  "description": "My order ORD-2024-001 was supposed to be delivered today but hasn't arrived yet.",
  "category": "order_issue",
  "priority": "high",
  "relatedOrderId": "64a1b2c3d4e5f678901234a"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Ticket created successfully",
  "data": {
    "ticket": {
      "_id": "64a1b2c3d4e5f6789012355",
      "ticketNumber": "TKT-2024-001",
      "title": "Order not delivered on time",
      "description": "My order ORD-2024-001 was supposed to be delivered today but hasn't arrived yet.",
      "category": "order_issue",
      "priority": "high",
      "status": "open",
      "relatedOrder": "64a1b2c3d4e5f678901234a",
      "createdAt": "2024-01-17T10:00:00.000Z"
    }
  }
}
```

#### 3.7.3 Get All Tickets
**GET** `/api/customer/tickets?status=open&page=1&limit=10`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "_id": "64a1b2c3d4e5f6789012355",
        "ticketNumber": "TKT-2024-001",
        "title": "Order not delivered on time",
        "category": "order_issue",
        "priority": "high",
        "status": "open",
        "createdAt": "2024-01-17T10:00:00.000Z",
        "lastUpdated": "2024-01-17T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "total": 3
    }
  }
}
```

#### 3.7.4 Get Ticket by ID
**GET** `/api/customer/tickets/:ticketId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "ticket": {
      "_id": "64a1b2c3d4e5f6789012355",
      "ticketNumber": "TKT-2024-001",
      "title": "Order not delivered on time",
      "description": "My order ORD-2024-001 was supposed to be delivered today but hasn't arrived yet.",
      "category": "order_issue",
      "priority": "high",
      "status": "in_progress",
      "assignedTo": {
        "_id": "64a1b2c3d4e5f6789012356",
        "name": "Support Agent"
      },
      "messages": [
        {
          "_id": "64a1b2c3d4e5f6789012357",
          "sender": {
            "_id": "64a1b2c3d4e5f6789012345",
            "name": "John Doe"
          },
          "message": "My order ORD-2024-001 was supposed to be delivered today but hasn't arrived yet.",
          "timestamp": "2024-01-17T10:00:00.000Z",
          "isInternal": false
        },
        {
          "_id": "64a1b2c3d4e5f6789012358",
          "sender": {
            "_id": "64a1b2c3d4e5f6789012356",
            "name": "Support Agent"
          },
          "message": "We apologize for the delay. Let me check the status for you.",
          "timestamp": "2024-01-17T10:15:00.000Z",
          "isInternal": false
        }
      ],
      "createdAt": "2024-01-17T10:00:00.000Z",
      "updatedAt": "2024-01-17T10:15:00.000Z"
    }
  }
}
```

#### 3.7.5 Add Message to Ticket
**POST** `/api/customer/tickets/:ticketId/messages`

**Request Body:**
```json
{
  "message": "Thank you for checking. Please let me know the updated delivery time."
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Message added successfully",
  "data": {
    "message": {
      "_id": "64a1b2c3d4e5f6789012359",
      "sender": {
        "_id": "64a1b2c3d4e5f6789012345",
        "name": "John Doe"
      },
      "message": "Thank you for checking. Please let me know the updated delivery time.",
      "timestamp": "2024-01-17T10:30:00.000Z"
    }
  }
}
```

### 3.8 Reviews

#### 3.8.1 Get Customer Reviews
**GET** `/api/customer/reviews?page=1&limit=10`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "64a1b2c3d4e5f678901235a",
        "order": {
          "_id": "64a1b2c3d4e5f678901234a",
          "orderNumber": "ORD-2024-001"
        },
        "rating": 5,
        "review": "Excellent service!",
        "serviceQuality": 5,
        "deliveryTime": 5,
        "packaging": 5,
        "createdAt": "2024-01-17T18:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "total": 12
    }
  }
}
```

### 3.9 Campaigns

#### 3.9.1 Get Active Campaigns
**GET** `/api/customer/campaigns/active`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "campaigns": [
      {
        "_id": "64a1b2c3d4e5f678901235b",
        "name": "New Year Special",
        "description": "Get 20% off on all orders",
        "type": "discount",
        "discountValue": 20,
        "discountType": "percentage",
        "validFrom": "2024-01-01T00:00:00.000Z",
        "validUntil": "2024-01-31T23:59:59.000Z",
        "isActive": true
      }
    ]
  }
}
```

---

## 4. Admin APIs

### Base Path: `/api/admin`
**Auth Required:** Yes (Admin role with appropriate permissions)

### 4.1 Dashboard

#### 4.1.1 Get Dashboard Overview
**GET** `/api/admin/dashboard`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalOrders": 1250,
      "pendingOrders": 45,
      "processingOrders": 78,
      "completedOrders": 1100,
      "totalRevenue": 125000,
      "todayRevenue": 5500,
      "activeCustomers": 450,
      "newCustomers": 25
    },
    "recentOrders": [
      {
        "_id": "64a1b2c3d4e5f678901234a",
        "orderNumber": "ORD-2024-001",
        "customer": {
          "name": "John Doe"
        },
        "status": "processing",
        "total": 250,
        "createdAt": "2024-01-17T10:00:00.000Z"
      }
    ],
    "charts": {
      "weeklyOrders": [
        { "day": "Mon", "orders": 45 },
        { "day": "Tue", "orders": 52 },
        { "day": "Wed", "orders": 48 }
      ],
      "revenueByService": [
        { "service": "Wash & Fold", "revenue": 45000 },
        { "service": "Dry Cleaning", "revenue": 35000 }
      ]
    }
  }
}
```

### 4.2 Order Management

#### 4.2.1 Get All Orders
**GET** `/api/admin/orders?page=1&limit=20&status=pending&search=ORD-2024`

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: Filter by status
- `search`: Search by order number or customer name
- `startDate`, `endDate`: Date range filter
- `branch`: Filter by branch ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "_id": "64a1b2c3d4e5f678901234a",
        "orderNumber": "ORD-2024-001",
        "customer": {
          "_id": "64a1b2c3d4e5f6789012345",
          "name": "John Doe",
          "phone": "9876543210"
        },
        "branch": {
          "_id": "64a1b2c3d4e5f6789012347",
          "name": "Downtown Branch"
        },
        "status": "pending",
        "serviceType": "full_service",
        "pricing": {
          "total": 250
        },
        "paymentStatus": "pending",
        "pickupDate": "2024-01-15T09:00:00.000Z",
        "createdAt": "2024-01-14T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "total": 195
    }
  }
}
```

#### 4.2.2 Assign Order to Branch
**PUT** `/api/admin/orders/:orderId/assign-branch`

**Request Body:**
```json
{
  "branchId": "64a1b2c3d4e5f6789012347"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order assigned to branch successfully",
  "data": {
    "order": {
      "_id": "64a1b2c3d4e5f678901234a",
      "orderNumber": "ORD-2024-001",
      "branch": {
        "_id": "64a1b2c3d4e5f6789012347",
        "name": "Downtown Branch"
      }
    }
  }
}
```

#### 4.2.3 Update Order Status
**PUT** `/api/admin/orders/:orderId/status`

**Request Body:**
```json
{
  "status": "processing",
  "note": "Order is being processed"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "order": {
      "_id": "64a1b2c3d4e5f678901234a",
      "orderNumber": "ORD-2024-001",
      "status": "processing"
    }
  }
}
```

### 4.3 Customer Management

#### 4.3.1 Get All Customers
**GET** `/api/admin/customers?page=1&limit=20&search=john`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "_id": "64a1b2c3d4e5f6789012345",
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "9876543210",
        "totalOrders": 15,
        "totalSpent": 3750,
        "isVIP": false,
        "isActive": true,
        "createdAt": "2023-12-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 25,
      "total": 485
    }
  }
}
```

#### 4.3.2 Get Customer Details
**GET** `/api/admin/customers/:customerId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "customer": {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "addresses": [
        {
          "_id": "64a1b2c3d4e5f6789012348",
          "name": "Home",
          "addressLine1": "123 Main Street",
          "city": "Mumbai",
          "pincode": "400001"
        }
      ],
      "orders": [
        {
          "_id": "64a1b2c3d4e5f678901234a",
          "orderNumber": "ORD-2024-001",
          "status": "delivered",
          "total": 250,
          "createdAt": "2024-01-14T10:00:00.000Z"
        }
      ],
      "stats": {
        "totalOrders": 15,
        "completedOrders": 14,
        "cancelledOrders": 1,
        "totalSpent": 3750,
        "averageOrderValue": 250,
        "loyaltyPoints": 1250
      },
      "isVIP": false,
      "isActive": true,
      "createdAt": "2023-12-01T10:00:00.000Z"
    }
  }
}
```

#### 4.3.3 Toggle Customer Status
**PUT** `/api/admin/customers/:customerId/toggle-status`

**Response (200):**
```json
{
  "success": true,
  "message": "Customer status updated",
  "data": {
    "customer": {
      "_id": "64a1b2c3d4e5f6789012345",
      "isActive": false
    }
  }
}
```

### 4.4 Staff Management

#### 4.4.1 Get All Staff
**GET** `/api/admin/staff?page=1&limit=20&role=driver`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "staff": [
      {
        "_id": "64a1b2c3d4e5f678901235c",
        "name": "Mike Driver",
        "email": "mike@example.com",
        "phone": "9876543211",
        "role": "driver",
        "branch": {
          "_id": "64a1b2c3d4e5f6789012347",
          "name": "Downtown Branch"
        },
        "isActive": true,
        "createdAt": "2024-01-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "total": 45
    }
  }
}
```

#### 4.4.2 Create Staff
**POST** `/api/admin/staff`

**Request Body:**
```json
{
  "name": "Mike Driver",
  "email": "mike@example.com",
  "phone": "9876543211",
  "password": "SecurePass123!",
  "role": "driver",
  "branchId": "64a1b2c3d4e5f6789012347",
  "salary": 25000,
  "joiningDate": "2024-01-01"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Staff created successfully",
  "data": {
    "staff": {
      "_id": "64a1b2c3d4e5f678901235c",
      "name": "Mike Driver",
      "email": "mike@example.com",
      "role": "driver",
      "branch": "64a1b2c3d4e5f6789012347"
    }
  }
}
```

### 4.5 Inventory Management

#### 4.5.1 Get Inventory
**GET** `/api/admin/inventory?page=1&limit=20&category=detergent`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "inventory": [
      {
        "_id": "64a1b2c3d4e5f678901235d",
        "name": "Laundry Detergent",
        "category": "detergent",
        "quantity": 50,
        "unit": "kg",
        "minStockLevel": 20,
        "price": 150,
        "supplier": "ABC Supplies",
        "lastRestocked": "2024-01-10T10:00:00.000Z",
        "branch": {
          "_id": "64a1b2c3d4e5f6789012347",
          "name": "Downtown Branch"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "total": 85
    }
  }
}
```

#### 4.5.2 Add Inventory Item
**POST** `/api/admin/inventory`

**Request Body:**
```json
{
  "name": "Fabric Softener",
  "category": "softener",
  "quantity": 30,
  "unit": "liters",
  "minStockLevel": 10,
  "price": 200,
  "supplier": "XYZ Supplies",
  "branchId": "64a1b2c3d4e5f6789012347"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Inventory item added successfully",
  "data": {
    "item": {
      "_id": "64a1b2c3d4e5f678901235e",
      "name": "Fabric Softener",
      "quantity": 30,
      "unit": "liters"
    }
  }
}
```

### 4.6 Coupon Management

#### 4.6.1 Get All Coupons
**GET** `/api/admin/coupons?page=1&limit=20&status=active`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "coupons": [
      {
        "_id": "64a1b2c3d4e5f678901234e",
        "code": "FIRST50",
        "title": "First Order Discount",
        "discountType": "percentage",
        "discountValue": 10,
        "maxDiscount": 100,
        "minOrderValue": 300,
        "usageLimit": 1000,
        "usedCount": 245,
        "validFrom": "2024-01-01T00:00:00.000Z",
        "validUntil": "2024-12-31T23:59:59.000Z",
        "isActive": true
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "total": 45
    }
  }
}
```

#### 4.6.2 Create Coupon
**POST** `/api/admin/coupons`

**Request Body:**
```json
{
  "code": "SUMMER20",
  "title": "Summer Special",
  "description": "Get 20% off on all orders",
  "discountType": "percentage",
  "discountValue": 20,
  "maxDiscount": 200,
  "minOrderValue": 500,
  "usageLimit": 500,
  "validFrom": "2024-06-01T00:00:00.000Z",
  "validUntil": "2024-08-31T23:59:59.000Z",
  "applicableServices": ["wash_fold", "dry_cleaning"],
  "isActive": true
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Coupon created successfully",
  "data": {
    "coupon": {
      "_id": "64a1b2c3d4e5f678901235f",
      "code": "SUMMER20",
      "title": "Summer Special",
      "isActive": true
    }
  }
}
```

### 4.7 Analytics

#### 4.7.1 Get Analytics Overview
**GET** `/api/admin/analytics?startDate=2024-01-01&endDate=2024-01-31`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "revenue": {
      "total": 125000,
      "growth": 15.5,
      "byService": [
        { "service": "Wash & Fold", "revenue": 65000 },
        { "service": "Dry Cleaning", "revenue": 45000 },
        { "service": "Iron & Press", "revenue": 15000 }
      ]
    },
    "orders": {
      "total": 850,
      "completed": 780,
      "cancelled": 45,
      "pending": 25,
      "averageValue": 147
    },
    "customers": {
      "total": 450,
      "new": 85,
      "returning": 365,
      "retentionRate": 81.1
    },
    "topCustomers": [
      {
        "customer": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "totalOrders": 25,
        "totalSpent": 6250
      }
    ]
  }
}
```

### 4.8 Branding (Multi-tenant)

#### 4.8.1 Get Branding Settings
**GET** `/api/admin/branding`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "branding": {
      "logo": "https://example.com/logo.png",
      "favicon": "https://example.com/favicon.ico",
      "primaryColor": "#007bff",
      "secondaryColor": "#6c757d",
      "accentColor": "#28a745",
      "fontFamily": "Inter",
      "tagline": "Fast, Fresh, Fabulous!",
      "companyName": "QuickWash Laundry",
      "contactEmail": "support@quickwash.com",
      "contactPhone": "1800-123-4567",
      "socialMedia": {
        "facebook": "https://facebook.com/quickwash",
        "instagram": "https://instagram.com/quickwash",
        "twitter": "https://twitter.com/quickwash"
      }
    }
  }
}
```

#### 4.8.2 Update Branding
**PUT** `/api/admin/branding`

**Request Body:**
```json
{
  "primaryColor": "#0056b3",
  "tagline": "Your Laundry, Our Priority",
  "contactPhone": "1800-999-8888"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Branding updated successfully",
  "data": {
    "branding": {
      "primaryColor": "#0056b3",
      "tagline": "Your Laundry, Our Priority",
      "contactPhone": "1800-999-8888"
    }
  }
}
```

---

## 5. SuperAdmin APIs

### Base Path: `/api/superadmin`
**Auth Required:** Yes (SuperAdmin role with appropriate permissions)

### 5.1 Authentication

#### 5.1.1 SuperAdmin Login
**POST** `/api/superadmin/auth/login`

**Request Body:**
```json
{
  "email": "admin@laundry.com",
  "password": "SuperSecure123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "admin": {
      "_id": "64a1b2c3d4e5f6789012360",
      "name": "Super Admin",
      "email": "admin@laundry.com",
      "role": "super_admin",
      "permissions": ["all"]
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 5.2 Dashboard

#### 5.2.1 Get Dashboard Overview
**GET** `/api/superadmin/dashboard/overview?timeframe=30d`

**Query Parameters:**
- `timeframe`: 24h, 7d, 30d, 90d

**Response (200):**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalTenancies": 125,
      "activeTenancies": 118,
      "totalRevenue": 2500000,
      "monthlyRecurringRevenue": 185000,
      "totalOrders": 45000,
      "activeUsers": 8500,
      "growth": {
        "tenancies": 12.5,
        "revenue": 18.3,
        "orders": 22.1
      }
    },
    "recentTenancies": [
      {
        "_id": "64a1b2c3d4e5f6789012346",
        "name": "QuickWash Laundry",
        "slug": "quickwash",
        "plan": "professional",
        "status": "active",
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "charts": {
      "revenueByMonth": [
        { "month": "Jan", "revenue": 185000 },
        { "month": "Feb", "revenue": 195000 }
      ],
      "tenanciesByPlan": [
        { "plan": "starter", "count": 45 },
        { "plan": "professional", "count": 65 },
        { "plan": "enterprise", "count": 15 }
      ]
    }
  }
}
```

### 5.3 Tenancy Management

#### 5.3.1 Get All Tenancies
**GET** `/api/superadmin/tenancies?page=1&limit=20&status=active&plan=professional`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tenancies": [
      {
        "_id": "64a1b2c3d4e5f6789012346",
        "name": "QuickWash Laundry",
        "slug": "quickwash",
        "subdomain": "quickwash",
        "plan": {
          "_id": "64a1b2c3d4e5f6789012361",
          "name": "Professional",
          "price": 2999
        },
        "owner": {
          "_id": "64a1b2c3d4e5f6789012362",
          "name": "John Owner",
          "email": "john@quickwash.com"
        },
        "status": "active",
        "subscription": {
          "status": "active",
          "currentPeriodEnd": "2024-02-15T23:59:59.000Z",
          "autoRenew": true
        },
        "stats": {
          "totalOrders": 450,
          "activeUsers": 85,
          "revenue": 125000
        },
        "createdAt": "2023-12-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 7,
      "total": 125
    }
  }
}
```

#### 5.3.2 Create Tenancy
**POST** `/api/superadmin/tenancies`

**Request Body:**
```json
{
  "name": "FreshClean Laundry",
  "slug": "freshclean",
  "subdomain": "freshclean",
  "ownerEmail": "owner@freshclean.com",
  "ownerName": "Jane Owner",
  "ownerPhone": "9876543212",
  "planId": "64a1b2c3d4e5f6789012361",
  "billingCycle": "monthly",
  "branding": {
    "primaryColor": "#007bff",
    "tagline": "Fresh & Clean Always"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Tenancy created successfully",
  "data": {
    "tenancy": {
      "_id": "64a1b2c3d4e5f6789012363",
      "name": "FreshClean Laundry",
      "slug": "freshclean",
      "subdomain": "freshclean",
      "status": "active",
      "owner": {
        "_id": "64a1b2c3d4e5f6789012364",
        "email": "owner@freshclean.com"
      }
    },
    "credentials": {
      "email": "owner@freshclean.com",
      "temporaryPassword": "TempPass123!"
    }
  }
}
```

#### 5.3.3 Get Tenancy Details
**GET** `/api/superadmin/tenancies/:tenancyId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tenancy": {
      "_id": "64a1b2c3d4e5f6789012346",
      "name": "QuickWash Laundry",
      "slug": "quickwash",
      "subdomain": "quickwash",
      "plan": {
        "_id": "64a1b2c3d4e5f6789012361",
        "name": "Professional",
        "price": 2999,
        "features": {
          "maxOrders": 1000,
          "maxBranches": 5,
          "maxUsers": 50
        }
      },
      "owner": {
        "_id": "64a1b2c3d4e5f6789012362",
        "name": "John Owner",
        "email": "john@quickwash.com",
        "phone": "9876543210"
      },
      "subscription": {
        "status": "active",
        "currentPeriodStart": "2024-01-15T00:00:00.000Z",
        "currentPeriodEnd": "2024-02-15T23:59:59.000Z",
        "autoRenew": true,
        "paymentMethod": "stripe"
      },
      "usage": {
        "orders": 450,
        "branches": 3,
        "users": 28,
        "storage": "2.5 GB"
      },
      "branding": {
        "logo": "https://example.com/logo.png",
        "primaryColor": "#007bff",
        "tagline": "Fast, Fresh, Fabulous!"
      },
      "status": "active",
      "createdAt": "2023-12-01T10:00:00.000Z",
      "lastActivity": "2024-01-17T15:30:00.000Z"
    }
  }
}
```

#### 5.3.4 Update Tenancy
**PUT** `/api/superadmin/tenancies/:tenancyId`

**Request Body:**
```json
{
  "name": "QuickWash Premium Laundry",
  "status": "active"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Tenancy updated successfully",
  "data": {
    "tenancy": {
      "_id": "64a1b2c3d4e5f6789012346",
      "name": "QuickWash Premium Laundry",
      "status": "active"
    }
  }
}
```

#### 5.3.5 Suspend Tenancy
**PUT** `/api/superadmin/tenancies/:tenancyId/suspend`

**Request Body:**
```json
{
  "reason": "Payment overdue"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Tenancy suspended successfully",
  "data": {
    "tenancy": {
      "_id": "64a1b2c3d4e5f6789012346",
      "status": "suspended",
      "suspensionReason": "Payment overdue"
    }
  }
}
```

### 5.4 Branch Management

#### 5.4.1 Get All Branches
**GET** `/api/superadmin/branches?page=1&limit=20&tenancyId=64a1b2c3d4e5f6789012346`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "branches": [
      {
        "_id": "64a1b2c3d4e5f6789012347",
        "name": "Downtown Branch",
        "code": "DT001",
        "tenancy": {
          "_id": "64a1b2c3d4e5f6789012346",
          "name": "QuickWash Laundry"
        },
        "address": {
          "addressLine1": "789 Business Street",
          "city": "Mumbai",
          "state": "Maharashtra",
          "pincode": "400001"
        },
        "contact": {
          "phone": "9876543213",
          "email": "downtown@quickwash.com"
        },
        "manager": {
          "_id": "64a1b2c3d4e5f6789012365",
          "name": "Branch Manager"
        },
        "capacity": {
          "maxOrdersPerDay": 100,
          "maxWeightPerDay": 500
        },
        "isActive": true,
        "createdAt": "2024-01-05T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 15,
      "total": 285
    }
  }
}
```

#### 5.4.2 Create Branch
**POST** `/api/superadmin/branches`

**Request Body:**
```json
{
  "tenancyId": "64a1b2c3d4e5f6789012346",
  "name": "Uptown Branch",
  "code": "UT001",
  "address": {
    "addressLine1": "456 North Avenue",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400002"
  },
  "contact": {
    "phone": "9876543214",
    "email": "uptown@quickwash.com"
  },
  "capacity": {
    "maxOrdersPerDay": 80,
    "maxWeightPerDay": 400
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Branch created successfully",
  "data": {
    "branch": {
      "_id": "64a1b2c3d4e5f6789012366",
      "name": "Uptown Branch",
      "code": "UT001",
      "isActive": true
    }
  }
}
```

### 5.5 Pricing Management

#### 5.5.1 Get All Pricing Plans
**GET** `/api/superadmin/pricing?page=1&limit=20`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pricingPlans": [
      {
        "_id": "64a1b2c3d4e5f6789012367",
        "name": "Standard Pricing",
        "version": "v1.0",
        "serviceItems": [
          {
            "name": "Shirt",
            "category": "wash_fold",
            "basePrice": 50,
            "unit": "per_piece"
          },
          {
            "name": "Jeans",
            "category": "wash_fold",
            "basePrice": 80,
            "unit": "per_piece"
          },
          {
            "name": "Suit",
            "category": "dry_cleaning",
            "basePrice": 300,
            "unit": "per_piece"
          }
        ],
        "isActive": true,
        "createdAt": "2024-01-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "total": 45
    }
  }
}
```

#### 5.5.2 Create Pricing Plan
**POST** `/api/superadmin/pricing`

**Request Body:**
```json
{
  "name": "Premium Pricing",
  "version": "v2.0",
  "serviceItems": [
    {
      "name": "Shirt",
      "category": "wash_fold",
      "basePrice": 60,
      "unit": "per_piece",
      "description": "Regular shirt washing and folding"
    },
    {
      "name": "Suit",
      "category": "dry_cleaning",
      "basePrice": 350,
      "unit": "per_piece",
      "description": "Professional suit dry cleaning"
    }
  ],
  "isActive": true
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Pricing plan created successfully",
  "data": {
    "pricingPlan": {
      "_id": "64a1b2c3d4e5f6789012368",
      "name": "Premium Pricing",
      "version": "v2.0",
      "isActive": true
    }
  }
}
```

### 5.6 User Management

#### 5.6.1 Get All Users
**GET** `/api/superadmin/users?page=1&limit=20&role=admin&tenancyId=64a1b2c3d4e5f6789012346`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "64a1b2c3d4e5f6789012369",
        "name": "Admin User",
        "email": "admin@quickwash.com",
        "phone": "9876543215",
        "role": "admin",
        "tenancy": {
          "_id": "64a1b2c3d4e5f6789012346",
          "name": "QuickWash Laundry"
        },
        "isActive": true,
        "lastLogin": "2024-01-17T10:00:00.000Z",
        "createdAt": "2024-01-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 42,
      "total": 825
    }
  }
}
```

### 5.7 Billing & Subscriptions

#### 5.7.1 Get Billing Overview
**GET** `/api/superadmin/billing/overview?month=2024-01`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalRevenue": 375000,
      "subscriptionRevenue": 350000,
      "addOnRevenue": 25000,
      "pendingPayments": 15000,
      "failedPayments": 5000,
      "activeSubscriptions": 118,
      "churnRate": 2.5
    },
    "revenueByPlan": [
      { "plan": "Starter", "revenue": 45000, "count": 45 },
      { "plan": "Professional", "revenue": 195000, "count": 65 },
      { "plan": "Enterprise", "revenue": 110000, "count": 8 }
    ],
    "upcomingRenewals": [
      {
        "tenancy": {
          "name": "QuickWash Laundry",
          "slug": "quickwash"
        },
        "plan": "Professional",
        "amount": 2999,
        "renewalDate": "2024-02-15T00:00:00.000Z"
      }
    ]
  }
}
```

### 5.8 Analytics

#### 5.8.1 Get Platform Analytics
**GET** `/api/superadmin/analytics?startDate=2024-01-01&endDate=2024-01-31&metrics=revenue,orders,customers`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "analytics": {
      "revenue": {
        "total": 2500000,
        "growth": 18.5,
        "byDay": [
          { "date": "2024-01-01", "revenue": 85000 },
          { "date": "2024-01-02", "revenue": 92000 }
        ]
      },
      "orders": {
        "total": 45000,
        "growth": 22.1,
        "byStatus": {
          "completed": 41000,
          "cancelled": 2500,
          "pending": 1500
        }
      },
      "customers": {
        "total": 8500,
        "new": 1250,
        "active": 6800,
        "churnRate": 3.2
      },
      "tenancies": {
        "total": 125,
        "active": 118,
        "suspended": 5,
        "trial": 2
      }
    }
  }
}
```

### 5.9 Roles & Permissions (RBAC)

#### 5.9.1 Get All Roles
**GET** `/api/superadmin/roles`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "_id": "64a1b2c3d4e5f678901236a",
        "name": "branch_manager",
        "displayName": "Branch Manager",
        "description": "Manages branch operations",
        "level": 3,
        "category": "operations",
        "permissions": {
          "orders": ["view", "create", "update"],
          "staff": ["view", "create"],
          "inventory": ["view", "update"]
        },
        "isSystem": true,
        "createdAt": "2024-01-01T10:00:00.000Z"
      }
    ]
  }
}
```

#### 5.9.2 Create Role
**POST** `/api/superadmin/roles`

**Request Body:**
```json
{
  "name": "quality_inspector",
  "displayName": "Quality Inspector",
  "description": "Inspects quality of laundry services",
  "level": 2,
  "category": "operations",
  "permissions": {
    "orders": ["view", "update"],
    "quality": ["view", "create", "update"]
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": {
    "role": {
      "_id": "64a1b2c3d4e5f678901236b",
      "name": "quality_inspector",
      "displayName": "Quality Inspector",
      "isSystem": false
    }
  }
}
```

### 5.10 Audit Logs

#### 5.10.1 Get Audit Logs
**GET** `/api/superadmin/audit?page=1&limit=50&action=create&resource=tenancy`

**Query Parameters:**
- `page`, `limit`: Pagination
- `action`: create, update, delete, login, etc.
- `resource`: tenancy, user, order, etc.
- `userId`: Filter by user
- `startDate`, `endDate`: Date range

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "64a1b2c3d4e5f678901236c",
        "action": "create",
        "resource": "tenancy",
        "resourceId": "64a1b2c3d4e5f6789012346",
        "user": {
          "_id": "64a1b2c3d4e5f6789012360",
          "name": "Super Admin",
          "email": "admin@laundry.com"
        },
        "details": {
          "tenancyName": "QuickWash Laundry",
          "plan": "Professional"
        },
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "timestamp": "2024-01-15T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 125,
      "total": 6245
    }
  }
}
```

---

## 6. Support APIs

### Base Path: `/api/support`
**Auth Required:** Yes (Support role)

### 6.1 Dashboard

#### 6.1.1 Get Support Dashboard
**GET** `/api/support/dashboard`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "openTickets": 45,
      "inProgressTickets": 28,
      "resolvedToday": 32,
      "averageResponseTime": "2.5 hours",
      "averageResolutionTime": "8.3 hours",
      "customerSatisfaction": 4.6
    },
    "myTickets": {
      "assigned": 12,
      "inProgress": 5,
      "resolved": 45
    },
    "recentTickets": [
      {
        "_id": "64a1b2c3d4e5f6789012355",
        "ticketNumber": "TKT-2024-001",
        "title": "Order not delivered on time",
        "priority": "high",
        "status": "in_progress",
        "customer": {
          "name": "John Doe"
        },
        "createdAt": "2024-01-17T10:00:00.000Z"
      }
    ]
  }
}
```

### 6.2 Ticket Management

#### 6.2.1 Get All Tickets
**GET** `/api/support/tickets?page=1&limit=20&status=open&priority=high`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "_id": "64a1b2c3d4e5f6789012355",
        "ticketNumber": "TKT-2024-001",
        "title": "Order not delivered on time",
        "category": "order_issue",
        "priority": "high",
        "status": "in_progress",
        "raisedBy": {
          "_id": "64a1b2c3d4e5f6789012345",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "assignedTo": {
          "_id": "64a1b2c3d4e5f6789012356",
          "name": "Support Agent"
        },
        "relatedOrder": {
          "_id": "64a1b2c3d4e5f678901234a",
          "orderNumber": "ORD-2024-001"
        },
        "createdAt": "2024-01-17T10:00:00.000Z",
        "lastUpdated": "2024-01-17T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "total": 95
    }
  }
}
```

#### 6.2.2 Assign Ticket
**PUT** `/api/support/tickets/:ticketId/assign`

**Request Body:**
```json
{
  "assigneeId": "64a1b2c3d4e5f6789012356"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Ticket assigned successfully",
  "data": {
    "ticket": {
      "_id": "64a1b2c3d4e5f6789012355",
      "assignedTo": {
        "_id": "64a1b2c3d4e5f6789012356",
        "name": "Support Agent"
      }
    }
  }
}
```

#### 6.2.3 Update Ticket Status
**PUT** `/api/support/tickets/:ticketId/status`

**Request Body:**
```json
{
  "status": "resolved",
  "resolution": "Order was delivered. Customer confirmed receipt."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Ticket status updated",
  "data": {
    "ticket": {
      "_id": "64a1b2c3d4e5f6789012355",
      "status": "resolved",
      "resolution": "Order was delivered. Customer confirmed receipt.",
      "resolvedAt": "2024-01-17T14:00:00.000Z"
    }
  }
}
```

### 6.3 Knowledge Base

#### 6.3.1 Get Knowledge Base Articles
**GET** `/api/support/knowledge-base?category=order_management&search=delivery`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "articles": [
      {
        "_id": "64a1b2c3d4e5f678901236d",
        "title": "How to handle delayed deliveries",
        "category": "order_management",
        "content": "Step-by-step guide for handling delayed deliveries...",
        "tags": ["delivery", "delay", "customer-service"],
        "views": 245,
        "helpful": 198,
        "createdAt": "2024-01-01T10:00:00.000Z",
        "updatedAt": "2024-01-15T12:00:00.000Z"
      }
    ]
  }
}
```

---

## 7. Sales APIs

### Base Path: `/api/sales`
**Auth Required:** Yes (Sales role)

### 7.1 Authentication

#### 7.1.1 Sales Login
**POST** `/api/sales/auth/login`

**Request Body:**
```json
{
  "email": "sales@laundry.com",
  "password": "SalesPass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "64a1b2c3d4e5f678901236e",
      "name": "Sales Agent",
      "email": "sales@laundry.com",
      "role": "sales"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 7.2 Lead Management

#### 7.2.1 Get All Leads
**GET** `/api/sales/leads?page=1&limit=20&status=new&source=website`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "leads": [
      {
        "_id": "64a1b2c3d4e5f678901236f",
        "name": "Potential Customer",
        "email": "potential@example.com",
        "phone": "9876543216",
        "company": "ABC Laundry",
        "source": "website",
        "status": "new",
        "interest": "professional_plan",
        "notes": "Interested in multi-branch setup",
        "assignedTo": {
          "_id": "64a1b2c3d4e5f678901236e",
          "name": "Sales Agent"
        },
        "createdAt": "2024-01-17T10:00:00.000Z",
        "lastContact": null
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 8,
      "total": 152
    }
  }
}
```

#### 7.2.2 Create Lead
**POST** `/api/sales/leads`

**Request Body:**
```json
{
  "name": "New Lead",
  "email": "newlead@example.com",
  "phone": "9876543217",
  "company": "XYZ Laundry",
  "source": "referral",
  "interest": "enterprise_plan",
  "notes": "Referred by existing customer"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Lead created successfully",
  "data": {
    "lead": {
      "_id": "64a1b2c3d4e5f6789012370",
      "name": "New Lead",
      "email": "newlead@example.com",
      "status": "new"
    }
  }
}
```

#### 7.2.3 Update Lead Status
**PUT** `/api/sales/leads/:leadId/status`

**Request Body:**
```json
{
  "status": "contacted",
  "notes": "Had initial call. Interested in demo."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Lead status updated",
  "data": {
    "lead": {
      "_id": "64a1b2c3d4e5f678901236f",
      "status": "contacted",
      "lastContact": "2024-01-17T15:00:00.000Z"
    }
  }
}
```

### 7.3 Subscription Management

#### 7.3.1 Get Subscriptions
**GET** `/api/sales/subscriptions?page=1&limit=20&status=active`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "_id": "64a1b2c3d4e5f6789012371",
        "tenancy": {
          "_id": "64a1b2c3d4e5f6789012346",
          "name": "QuickWash Laundry"
        },
        "plan": {
          "name": "Professional",
          "price": 2999
        },
        "status": "active",
        "billingCycle": "monthly",
        "currentPeriodStart": "2024-01-15T00:00:00.000Z",
        "currentPeriodEnd": "2024-02-15T23:59:59.000Z",
        "autoRenew": true,
        "nextBillingDate": "2024-02-15T00:00:00.000Z",
        "totalRevenue": 35988
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 6,
      "total": 118
    }
  }
}
```

### 7.4 Analytics

#### 7.4.1 Get Sales Analytics
**GET** `/api/sales/analytics?startDate=2024-01-01&endDate=2024-01-31`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "analytics": {
      "leads": {
        "total": 152,
        "new": 45,
        "contacted": 68,
        "qualified": 25,
        "converted": 14,
        "conversionRate": 9.2
      },
      "revenue": {
        "total": 375000,
        "newSubscriptions": 42000,
        "renewals": 333000
      },
      "subscriptions": {
        "new": 14,
        "renewed": 104,
        "cancelled": 3,
        "churnRate": 2.5
      },
      "performance": {
        "averageDealSize": 3000,
        "averageSalesCycle": "12 days",
        "topPerformer": {
          "name": "Sales Agent",
          "conversions": 8,
          "revenue": 24000
        }
      }
    }
  }
}
```

---

## 8. Add-on APIs

### Base Path: `/api/addons`

### 8.1 Marketplace (Public)

#### 8.1.1 Get Marketplace Add-ons
**GET** `/api/addons/marketplace?category=capacity&sortBy=popular&page=1&limit=12`

**Query Parameters:**
- `category`: capacity, feature, usage, branding, integration, support
- `sortBy`: popular, price_low, price_high, newest, name
- `search`: Search term
- `priceRange`: e.g., "0-1000"

**Response (200):**
```json
{
  "success": true,
  "data": {
    "addOns": [
      {
        "_id": "64a1b2c3d4e5f6789012372",
        "name": "Extra Order Capacity",
        "slug": "extra-order-capacity",
        "category": "capacity",
        "description": "Increase your monthly order limit by 500 orders",
        "features": [
          "+500 orders per month",
          "No additional setup required",
          "Instant activation"
        ],
        "pricing": {
          "monthly": 499,
          "yearly": 4990,
          "oneTime": null
        },
        "icon": "https://example.com/icons/capacity.png",
        "isPopular": true,
        "rating": 4.8,
        "totalPurchases": 245
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 4,
      "total": 42
    }
  }
}
```

#### 8.1.2 Get Add-on Details
**GET** `/api/addons/:addOnId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "addOn": {
      "_id": "64a1b2c3d4e5f6789012372",
      "name": "Extra Order Capacity",
      "slug": "extra-order-capacity",
      "category": "capacity",
      "description": "Increase your monthly order limit by 500 orders",
      "longDescription": "Detailed description of the add-on...",
      "features": [
        "+500 orders per month",
        "No additional setup required",
        "Instant activation",
        "24/7 support included"
      ],
      "pricing": {
        "monthly": 499,
        "yearly": 4990,
        "oneTime": null
      },
      "requirements": {
        "minPlan": "professional",
        "compatiblePlans": ["professional", "enterprise"]
      },
      "screenshots": [
        "https://example.com/screenshots/1.png"
      ],
      "rating": 4.8,
      "reviews": 45,
      "totalPurchases": 245,
      "isActive": true
    }
  }
}
```

### 8.2 Tenant Add-ons (Protected)

#### 8.2.1 Purchase Add-on
**POST** `/api/addons/:addOnId/purchase`  
**Auth Required:** Yes (Tenant Admin)

**Request Body:**
```json
{
  "billingCycle": "monthly",
  "quantity": 1,
  "paymentMethodId": "pm_1234567890",
  "couponCode": "ADDON10"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Add-on purchased successfully",
  "data": {
    "tenantAddOn": {
      "_id": "64a1b2c3d4e5f6789012373",
      "addOn": {
        "name": "Extra Order Capacity"
      },
      "status": "active",
      "billingCycle": "monthly",
      "price": 449,
      "nextBillingDate": "2024-02-17T00:00:00.000Z",
      "activatedAt": "2024-01-17T15:00:00.000Z"
    }
  }
}
```

#### 8.2.2 Get My Add-ons
**GET** `/api/addons/tenant/my-addons?status=active`  
**Auth Required:** Yes (Tenant Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "addOns": [
      {
        "_id": "64a1b2c3d4e5f6789012373",
        "addOn": {
          "_id": "64a1b2c3d4e5f6789012372",
          "name": "Extra Order Capacity",
          "category": "capacity"
        },
        "status": "active",
        "billingCycle": "monthly",
        "price": 449,
        "quantity": 1,
        "currentPeriodStart": "2024-01-17T00:00:00.000Z",
        "currentPeriodEnd": "2024-02-17T23:59:59.000Z",
        "nextBillingDate": "2024-02-17T00:00:00.000Z",
        "autoRenew": true,
        "usage": {
          "used": 245,
          "limit": 500,
          "percentage": 49
        }
      }
    ]
  }
}
```

#### 8.2.3 Cancel Add-on
**POST** `/api/addons/tenant/:tenantAddOnId/cancel`  
**Auth Required:** Yes (Tenant Admin)

**Request Body:**
```json
{
  "reason": "No longer needed",
  "effectiveDate": "2024-02-17"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Add-on cancelled successfully",
  "data": {
    "tenantAddOn": {
      "_id": "64a1b2c3d4e5f6789012373",
      "status": "cancelled",
      "cancelledAt": "2024-01-17T16:00:00.000Z",
      "effectiveDate": "2024-02-17T23:59:59.000Z"
    }
  }
}
```

---

## 9. Blog APIs

### Base Path: `/api/blog` (Public) and `/api/superadmin/blog` (Admin)

### 9.1 Public Blog APIs

#### 9.1.1 Get All Blog Posts
**GET** `/api/blog?page=1&limit=10&category=tips&search=laundry`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "_id": "64a1b2c3d4e5f6789012374",
        "title": "10 Tips for Better Laundry Care",
        "slug": "10-tips-better-laundry-care",
        "excerpt": "Learn the best practices for taking care of your clothes...",
        "category": "tips",
        "author": {
          "name": "Admin User",
          "avatar": "https://example.com/avatar.jpg"
        },
        "featuredImage": "https://example.com/blog/image.jpg",
        "tags": ["laundry", "tips", "care"],
        "publishedAt": "2024-01-15T10:00:00.000Z",
        "readTime": "5 min"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "total": 48
    }
  }
}
```

#### 9.1.2 Get Blog Post by Slug
**GET** `/api/blog/:slug`

**Example:** `/api/blog/10-tips-better-laundry-care`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "post": {
      "_id": "64a1b2c3d4e5f6789012374",
      "title": "10 Tips for Better Laundry Care",
      "slug": "10-tips-better-laundry-care",
      "content": "Full blog post content in HTML or Markdown...",
      "excerpt": "Learn the best practices for taking care of your clothes...",
      "category": "tips",
      "author": {
        "_id": "64a1b2c3d4e5f6789012360",
        "name": "Admin User",
        "avatar": "https://example.com/avatar.jpg",
        "bio": "Content writer and laundry expert"
      },
      "featuredImage": "https://example.com/blog/image.jpg",
      "tags": ["laundry", "tips", "care"],
      "views": 1245,
      "likes": 89,
      "publishedAt": "2024-01-15T10:00:00.000Z",
      "readTime": "5 min",
      "relatedPosts": [
        {
          "_id": "64a1b2c3d4e5f6789012375",
          "title": "How to Remove Tough Stains",
          "slug": "remove-tough-stains",
          "excerpt": "Expert tips for stain removal..."
        }
      ]
    }
  }
}
```

### 9.2 Admin Blog APIs

#### 9.2.1 Create Blog Post
**POST** `/api/superadmin/blog`  
**Auth Required:** Yes (SuperAdmin)

**Request Body:**
```json
{
  "title": "New Blog Post",
  "slug": "new-blog-post",
  "content": "Full blog post content...",
  "excerpt": "Short excerpt...",
  "category": "news",
  "tags": ["laundry", "news"],
  "featuredImage": "https://example.com/image.jpg",
  "status": "published",
  "publishedAt": "2024-01-17T10:00:00.000Z"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Blog post created successfully",
  "data": {
    "post": {
      "_id": "64a1b2c3d4e5f6789012376",
      "title": "New Blog Post",
      "slug": "new-blog-post",
      "status": "published"
    }
  }
}
```

---

## 10. Webhook & Automation

### 10.1 Automation Rules

#### 10.1.1 Get Automation Rules
**GET** `/api/automation?page=1&limit=20&type=order_status`  
**Auth Required:** Yes (Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "rules": [
      {
        "_id": "64a1b2c3d4e5f6789012377",
        "name": "Send SMS on Order Delivery",
        "type": "order_status",
        "trigger": {
          "event": "order.delivered",
          "conditions": {
            "status": "delivered"
          }
        },
        "actions": [
          {
            "type": "send_sms",
            "template": "order_delivered",
            "recipient": "customer"
          }
        ],
        "isActive": true,
        "executionCount": 1245,
        "lastExecuted": "2024-01-17T14:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "total": 28
    }
  }
}
```

#### 10.1.2 Create Automation Rule
**POST** `/api/automation`  
**Auth Required:** Yes (Admin)

**Request Body:**
```json
{
  "name": "Send Email on Order Confirmation",
  "type": "order_status",
  "trigger": {
    "event": "order.confirmed",
    "conditions": {
      "status": "confirmed"
    }
  },
  "actions": [
    {
      "type": "send_email",
      "template": "order_confirmation",
      "recipient": "customer"
    }
  ],
  "isActive": true
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Automation rule created successfully",
  "data": {
    "rule": {
      "_id": "64a1b2c3d4e5f6789012378",
      "name": "Send Email on Order Confirmation",
      "isActive": true
    }
  }
}
```

### 10.2 Webhooks

#### 10.2.1 Get Webhook Status
**GET** `/api/admin/webhooks/status`  
**Auth Required:** Yes (Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "webhooks": [
      {
        "provider": "stripe",
        "status": "active",
        "lastReceived": "2024-01-17T15:00:00.000Z",
        "totalReceived": 1245,
        "failedCount": 3
      },
      {
        "provider": "twilio",
        "status": "active",
        "lastReceived": "2024-01-17T14:45:00.000Z",
        "totalReceived": 856,
        "failedCount": 0
      }
    ]
  }
}
```

---

## 11. Notifications

### Base Path: `/api/notifications` (User) and `/api/superadmin/notifications` (SuperAdmin)

### 11.1 User Notifications

#### 11.1.1 Get Notifications
**GET** `/api/notifications?page=1&limit=20&unreadOnly=true`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "_id": "64a1b2c3d4e5f6789012379",
        "type": "order_update",
        "title": "Order Delivered",
        "message": "Your order ORD-2024-001 has been delivered",
        "data": {
          "orderId": "64a1b2c3d4e5f678901234a",
          "orderNumber": "ORD-2024-001"
        },
        "isRead": false,
        "createdAt": "2024-01-17T15:00:00.000Z"
      }
    ],
    "unreadCount": 5,
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "total": 48
    }
  }
}
```

#### 11.1.2 Mark Notifications as Read
**PUT** `/api/notifications/mark-read`  
**Auth Required:** Yes

**Request Body:**
```json
{
  "notificationIds": [
    "64a1b2c3d4e5f6789012379",
    "64a1b2c3d4e5f678901237a"
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Notifications marked as read"
}
```

#### 11.1.3 Mark All as Read
**PUT** `/api/notifications/mark-all-read`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

#### 11.1.4 Get Unread Count
**GET** `/api/notifications/unread-count`  
**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

---

## 12. Barcode & QR Code

### Base Path: `/api/barcode`

#### 12.1 Generate Barcode
**POST** `/api/barcode/generate`  
**Auth Required:** Yes (Admin)

**Request Body:**
```json
{
  "orderId": "64a1b2c3d4e5f678901234a",
  "type": "qr"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "barcode": "BAR-2024-001",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "trackingUrl": "https://quickwash.com/track/BAR-2024-001"
  }
}
```

---

## 13. Delivery & Logistics

### Base Path: `/api/delivery`

#### 13.1 Get Delivery Pricing
**GET** `/api/delivery/pricing?pincode=400001`  
**Auth Required:** Yes (Admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pricing": {
      "baseCharge": 50,
      "perKmCharge": 10,
      "expressCharge": 100,
      "freeDeliveryThreshold": 500
    }
  }
}
```

#### 13.2 Update Delivery Pricing
**PUT** `/api/delivery/pricing`  
**Auth Required:** Yes (Admin)

**Request Body:**
```json
{
  "baseCharge": 60,
  "perKmCharge": 12,
  "expressCharge": 120
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Delivery pricing updated successfully"
}
```

---

## Error Responses

All API endpoints follow a consistent error response format:

### 400 Bad Request
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Valid email is required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "FORBIDDEN",
  "message": "You don't have permission to access this resource"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Resource not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later."
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred"
}
```

---

## Common Query Parameters

Most list endpoints support these query parameters:

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10, max: 100)
- `search` (string): Search term
- `sortBy` (string): Field to sort by
- `sortOrder` (string): asc or desc
- `startDate` (ISO date): Filter from date
- `endDate` (ISO date): Filter to date

---

## Rate Limiting

- **Public endpoints:** 100 requests per 15 minutes per IP
- **Authenticated endpoints:** 1000 requests per 15 minutes per user
- **SuperAdmin endpoints:** 2000 requests per 15 minutes

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1642425600
```

---

## Webhooks (Outgoing)

The system can send webhooks for various events:

### Order Events
- `order.created`
- `order.confirmed`
- `order.picked_up`
- `order.processing`
- `order.ready`
- `order.out_for_delivery`
- `order.delivered`
- `order.cancelled`

### Payment Events
- `payment.success`
- `payment.failed`
- `payment.refunded`

### Subscription Events
- `subscription.created`
- `subscription.renewed`
- `subscription.cancelled`
- `subscription.expired`

### Webhook Payload Example
```json
{
  "event": "order.delivered",
  "timestamp": "2024-01-17T15:00:00.000Z",
  "data": {
    "orderId": "64a1b2c3d4e5f678901234a",
    "orderNumber": "ORD-2024-001",
    "status": "delivered",
    "customer": {
      "id": "64a1b2c3d4e5f6789012345",
      "email": "john@example.com"
    }
  }
}
```

---

## Testing with APIDog

### Setup Instructions

1. **Import Collection:**
   - Create a new project in APIDog
   - Import this documentation or create requests manually

2. **Environment Variables:**
   ```
   BASE_URL: http://localhost:5000/api
   TOKEN: <your_jwt_token>
   SUPERADMIN_TOKEN: <superadmin_jwt_token>
   SALES_TOKEN: <sales_jwt_token>
   ```

3. **Authentication:**
   - First, call the login endpoint to get a token
   - Add the token to Authorization header: `Bearer {{TOKEN}}`

4. **Test Sequence:**
   - Start with authentication endpoints
   - Test public endpoints (no auth required)
   - Test customer endpoints with customer token
   - Test admin endpoints with admin token
   - Test superadmin endpoints with superadmin token

### Sample Test Flow

1. **Register & Login:**
   ```
   POST /auth/register
   POST /auth/login
   ```

2. **Create Order:**
   ```
   POST /customer/addresses
   POST /customer/orders
   GET /customer/orders/:orderId
   ```

3. **Admin Operations:**
   ```
   GET /admin/dashboard
   GET /admin/orders
   PUT /admin/orders/:orderId/status
   ```

---

## Additional Notes

- All timestamps are in ISO 8601 format (UTC)
- All monetary values are in the smallest currency unit (e.g., paise for INR)
- File uploads support: images (jpg, png, gif), documents (pdf)
- Maximum file size: 10MB
- Supported currencies: INR, USD
- API versioning: Currently v2.0.1

---

**For support or questions, contact:** support@laundry.com

**Last Updated:** January 2024
