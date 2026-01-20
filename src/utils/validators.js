const Joi = require('joi');
const { USER_ROLES, SERVICES, CLOTHING_CATEGORIES, ITEM_TYPES, TICKET_CATEGORIES, TICKET_PRIORITY, TICKET_STATUS } = require('../config/constants');

// Common validation schemas
const commonSchemas = {
  objectId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).message('Invalid ID format'),
  phone: Joi.string().regex(/^[6-9]\d{9}$/).message('Please enter a valid 10-digit phone number'),
  email: Joi.string().email().lowercase(),
  password: Joi.string().min(6).message('Password must be at least 6 characters'),
  pincode: Joi.string().regex(/^[1-9][0-9]{5}$/).message('Please enter a valid 6-digit pincode')
};

// Auth validation schemas
const authValidation = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: commonSchemas.email.required(),
    phone: commonSchemas.phone.required(),
    password: commonSchemas.password.required(),
    role: Joi.string().valid(...Object.values(USER_ROLES)).default(USER_ROLES.CUSTOMER)
  }),

  login: Joi.object({
    email: commonSchemas.email,
    phone: commonSchemas.phone,
    password: Joi.string().required()
  }).xor('email', 'phone'),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required()
  })
};

// User validation schemas
const userValidation = {
  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(50),
    email: commonSchemas.email,
    phone: commonSchemas.phone,
    preferences: Joi.object({
      preferredPickupTime: Joi.string(),
      savedServices: Joi.array().items(Joi.string().valid(...Object.values(SERVICES)))
    })
  }),

  addAddress: Joi.object({
    name: Joi.string().trim().required(),
    phone: commonSchemas.phone.required(),
    addressLine1: Joi.string().trim().required(),
    addressLine2: Joi.string().trim().allow(''),
    landmark: Joi.string().trim().allow(''),
    city: Joi.string().trim().required(),
    pincode: commonSchemas.pincode.required(),
    addressType: Joi.string().valid('home', 'office', 'other').default('home'),
    isDefault: Joi.boolean().default(false)
  })
};

// Order validation schemas
const orderValidation = {
  createOrder: Joi.object({
    items: Joi.array().items(
      Joi.object({
        itemType: Joi.string().valid(...Object.values(ITEM_TYPES)).required(),
        service: Joi.string().valid(...Object.values(SERVICES)).required(),
        category: Joi.string().valid(...Object.values(CLOTHING_CATEGORIES)).required(),
        quantity: Joi.number().integer().min(1).required(),
        specialInstructions: Joi.string().trim().allow('')
      })
    ).min(1).required(),
    pickupAddressId: commonSchemas.objectId.required(),
    deliveryAddressId: commonSchemas.objectId.required(),
    pickupDate: Joi.date().min('now').required(),
    pickupTimeSlot: Joi.string().required(),
    paymentMethod: Joi.string().valid('online', 'cod').required(),
    isExpress: Joi.boolean().default(false),
    specialInstructions: Joi.string().trim().allow('')
  }),

  updateOrderStatus: Joi.object({
    status: Joi.string().required(),
    notes: Joi.string().trim().allow('')
  }),

  assignOrder: Joi.object({
    branchId: commonSchemas.objectId,
    logisticsPartnerId: commonSchemas.objectId,
    staffId: commonSchemas.objectId
  }),

  rateOrder: Joi.object({
    score: Joi.number().integer().min(1).max(5).required(),
    feedback: Joi.string().trim().allow('')
  })
};

// Branch validation schemas
const branchValidation = {
  createBranch: Joi.object({
    name: Joi.string().trim().required(),
    code: Joi.string().trim().uppercase().required(),
    address: Joi.object({
      addressLine1: Joi.string().trim().required(),
      addressLine2: Joi.string().trim().allow(''),
      city: Joi.string().trim().required(),
      pincode: commonSchemas.pincode.required(),
      landmark: Joi.string().trim().allow('')
    }).required(),
    contact: Joi.object({
      phone: commonSchemas.phone.required(),
      email: commonSchemas.email
    }).required(),
    managerId: commonSchemas.objectId,
    capacity: Joi.object({
      maxOrdersPerDay: Joi.number().integer().min(1).default(100),
      maxWeightPerDay: Joi.number().min(1).default(500)
    }),
    serviceAreas: Joi.array().items(
      Joi.object({
        pincode: commonSchemas.pincode.required(),
        area: Joi.string().trim().required(),
        deliveryCharge: Joi.number().min(0).default(0)
      })
    )
  }),

  updateBranch: Joi.object({
    name: Joi.string().trim(),
    address: Joi.object({
      addressLine1: Joi.string().trim(),
      addressLine2: Joi.string().trim().allow(''),
      city: Joi.string().trim(),
      pincode: commonSchemas.pincode,
      landmark: Joi.string().trim().allow('')
    }),
    contact: Joi.object({
      phone: commonSchemas.phone,
      email: commonSchemas.email
    }),
    capacity: Joi.object({
      maxOrdersPerDay: Joi.number().integer().min(1),
      maxWeightPerDay: Joi.number().min(1)
    }),
    isActive: Joi.boolean()
  })
};

// Ticket validation schemas
const ticketValidation = {
  createTicket: Joi.object({
    title: Joi.string().trim().required(),
    description: Joi.string().trim().required(),
    category: Joi.string().valid(...Object.values(TICKET_CATEGORIES)).required(),
    priority: Joi.string().valid(...Object.values(TICKET_PRIORITY)).default(TICKET_PRIORITY.MEDIUM),
    relatedOrderId: commonSchemas.objectId
  }),

  updateTicket: Joi.object({
    status: Joi.string(),
    priority: Joi.string().valid(...Object.values(TICKET_PRIORITY)),
    assignedTo: commonSchemas.objectId,
    resolution: Joi.string().trim()
  }),

  addMessage: Joi.object({
    message: Joi.string().trim().required(),
    isInternal: Joi.boolean().default(false)
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid(...Object.values(TICKET_STATUS)).required(),
    resolution: Joi.string().trim().optional()
  }),

  escalate: Joi.object({
    escalationReason: Joi.string().trim().required(),
    escalateTo: Joi.string().optional()
  }),

  updatePriority: Joi.object({
    priority: Joi.string().valid(...Object.values(TICKET_PRIORITY)).required()
  })
};

// Staff validation schemas
const staffValidation = {
  createStaff: Joi.object({
    name: Joi.string().trim().required(),
    phone: commonSchemas.phone.required(),
    role: Joi.string().valid('washer', 'ironer').required(),
    branchId: commonSchemas.objectId.required()
  }),

  updateStaff: Joi.object({
    name: Joi.string().trim(),
    phone: commonSchemas.phone,
    isActive: Joi.boolean(),
    availability: Joi.object({
      isAvailable: Joi.boolean(),
      maxOrdersPerDay: Joi.number().integer().min(1)
    })
  })
};

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const message = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message
      });
    }
    
    next();
  };
};

// Support validation schemas
const supportValidation = {
  createUser: Joi.object({
    name: Joi.string().required().trim().max(50),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
    password: Joi.string().min(6).required(),
    assignedBranch: Joi.string().optional(),
    role: Joi.string().valid('support').optional(),
    isActive: Joi.boolean().optional(),
    permissions: Joi.object({
      support: Joi.object({
        view: Joi.boolean().optional(),
        create: Joi.boolean().optional(),
        update: Joi.boolean().optional(),
        delete: Joi.boolean().optional(),
        assign: Joi.boolean().optional(),
        respond: Joi.boolean().optional(),
        resolve: Joi.boolean().optional(),
        escalate: Joi.boolean().optional()
      }).optional(),
      tickets: Joi.object({
        view: Joi.boolean().optional(),
        create: Joi.boolean().optional(),
        update: Joi.boolean().optional(),
        assign: Joi.boolean().optional(),
        resolve: Joi.boolean().optional(),
        escalate: Joi.boolean().optional()
      }).optional()
    }).optional()
  }),
  
  updateUser: Joi.object({
    name: Joi.string().trim().max(50).optional(),
    phone: Joi.string().pattern(/^[6-9]\d{9}$/).optional(),
    assignedBranch: Joi.string().allow(null).optional(),
    isActive: Joi.boolean().optional(),
    permissions: Joi.object({
      tickets: Joi.object({
        view: Joi.boolean().optional(),
        create: Joi.boolean().optional(),
        update: Joi.boolean().optional(),
        assign: Joi.boolean().optional(),
        resolve: Joi.boolean().optional(),
        escalate: Joi.boolean().optional()
      }).optional()
    }).optional()
  }),
  
  resetPassword: Joi.object({
    newPassword: Joi.string().min(6).required()
  })
};

// Knowledge Base validation schemas
const knowledgeBaseValidation = {
  createArticle: Joi.object({
    title: Joi.string().trim().required().max(200),
    content: Joi.string().trim().required(),
    category: Joi.string().trim().required().max(50),
    tags: Joi.array().items(Joi.string().trim().max(30)).max(10).default([]),
    status: Joi.string().valid('draft', 'published', 'archived').default('published'),
    visibility: Joi.string().valid('public', 'internal', 'tenancy').default('tenancy'),
    searchKeywords: Joi.array().items(Joi.string().trim().max(50)).max(20).default([]),
    relatedArticles: Joi.array().items(commonSchemas.objectId).max(5).default([])
  }),

  updateArticle: Joi.object({
    title: Joi.string().trim().max(200).optional(),
    content: Joi.string().trim().optional(),
    category: Joi.string().trim().max(50).optional(),
    tags: Joi.array().items(Joi.string().trim().max(30)).max(10).optional(),
    status: Joi.string().valid('draft', 'published', 'archived').optional(),
    visibility: Joi.string().valid('public', 'internal', 'tenancy').optional(),
    searchKeywords: Joi.array().items(Joi.string().trim().max(50)).max(20).optional(),
    relatedArticles: Joi.array().items(commonSchemas.objectId).max(5).optional()
  }),

  markHelpful: Joi.object({
    helpful: Joi.boolean().required()
  }),

  createCategory: Joi.object({
    name: Joi.string().trim().required().max(50),
    description: Joi.string().trim().max(200).optional(),
    color: Joi.string().valid('blue', 'green', 'purple', 'orange', 'red', 'yellow', 'indigo', 'pink').default('blue'),
    icon: Joi.string().trim().max(50).default('BookOpen'),
    sortOrder: Joi.number().integer().min(0).default(0)
  }),

  updateCategory: Joi.object({
    name: Joi.string().trim().max(50).optional(),
    description: Joi.string().trim().max(200).optional(),
    color: Joi.string().valid('blue', 'green', 'purple', 'orange', 'red', 'yellow', 'indigo', 'pink').optional(),
    icon: Joi.string().trim().max(50).optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional()
  })
};

module.exports = {
  validate,
  authValidation,
  userValidation,
  orderValidation,
  branchValidation,
  ticketValidation,
  staffValidation,
  supportValidation,
  knowledgeBaseValidation,
  commonSchemas
};