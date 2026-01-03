const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { 
    type: String, 
    enum: ['manager', 'assistant_manager', 'supervisor', 'staff', 'driver'],
    required: true 
  },
  permissions: {
    orders: { type: Boolean, default: false },
    customers: { type: Boolean, default: false },
    inventory: { type: Boolean, default: false },
    reports: { type: Boolean, default: false },
    settings: { type: Boolean, default: false }
  },
  salary: { type: Number },
  joinDate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
})

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Branch code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  // Top-level coordinates for distance calculations
  coordinates: {
    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  // Maximum serviceable distance from this branch (in km)
  serviceableRadius: {
    type: Number,
    default: 20,
    min: 1,
    max: 100
  },
  // Branch-specific delivery pricing override
  deliveryPricingOverride: {
    enabled: { type: Boolean, default: false },
    baseDistance: { type: Number },
    perKmRate: { type: Number },
    maxDistance: { type: Number }
  },
  address: {
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    landmark: String,
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  contact: {
    phone: { type: String, required: true },
    email: String,
    whatsapp: String
  },
  
  // Staff Management
  staff: [staffSchema],
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Capacity Management
  capacity: {
    maxOrdersPerDay: {
      type: Number,
      default: 100,
      min: 1,
      max: 1000
    },
    maxWeightPerDay: {
      type: Number,
      default: 500, // kg
      min: 50,
      max: 5000
    },
    maxCustomersPerDay: {
      type: Number,
      default: 200
    },
    staffCount: {
      type: Number,
      default: 5
    }
  },
  // Operating Schedule
  operatingHours: {
    openTime: {
      type: String,
      default: '09:00'
    },
    closeTime: {
      type: String,
      default: '18:00'
    },
    workingDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    }],
    lunchBreak: {
      start: { type: String, default: '13:00' },
      end: { type: String, default: '14:00' }
    }
  },
  
  // Service Areas & Territory
  serviceAreas: [{
    pincode: String,
    area: String,
    deliveryCharge: {
      type: Number,
      default: 0
    },
    isActive: { type: Boolean, default: true },
    maxDeliveryTime: { type: Number, default: 60 } // minutes
  }],
  
  // Branch Status & Settings
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'suspended'],
    default: 'active'
  },
  
  // Holiday & Special Days Management
  holidays: [{
    date: Date,
    reason: String,
    isRecurring: {
      type: Boolean,
      default: false
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterAdmin' }
  }],
  
  // Financial Settings
  financials: {
    refundLimit: {
      type: Number,
      default: 500 // Branch manager can refund up to ₹500
    },
    discountLimit: {
      type: Number,
      default: 20 // Maximum discount percentage
    },
    commissionRate: {
      type: Number,
      default: 10 // Percentage of revenue as commission
    }
  },
  
  // Performance Metrics
  metrics: {
    totalOrders: {
      type: Number,
      default: 0
    },
    completedOrders: {
      type: Number,
      default: 0
    },
    cancelledOrders: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    monthlyRevenue: {
      type: Number,
      default: 0
    },
    customerCount: {
      type: Number,
      default: 0
    },
    averageOrderValue: {
      type: Number,
      default: 0
    },
    efficiency: {
      type: Number,
      default: 0 // Calculated metric
    }
  },
  
  // Compliance & Certifications
  compliance: {
    licenseNumber: String,
    licenseExpiry: Date,
    insuranceNumber: String,
    insuranceExpiry: Date,
    certifications: [String],
    lastInspection: Date,
    nextInspection: Date
  },
  
  // Creation & Management Info
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CenterAdmin',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CenterAdmin'
  }
}, {
  timestamps: true
});

// Indexes
branchSchema.index({ code: 1 });
branchSchema.index({ 'serviceAreas.pincode': 1 });
branchSchema.index({ isActive: 1 });

// Check if branch is operational today
branchSchema.methods.isOperationalToday = function() {
  try {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const isWorkingDay = this.operatingHours?.workingDays?.includes(today) ?? false;
    
    // Check if today is a holiday
    const todayDate = new Date().toDateString();
    const isHoliday = this.holidays?.some(holiday => 
      holiday.date && holiday.date.toDateString() === todayDate
    ) ?? false;
    
    return isWorkingDay && !isHoliday && this.isActive && this.status === 'active';
  } catch (error) {
    console.error('Error in isOperationalToday:', error);
    return this.isActive && this.status === 'active';
  }
};

// Check capacity availability
branchSchema.methods.hasCapacity = function(additionalOrders = 1, additionalWeight = 0) {
  // This would need to be calculated based on today's orders
  // For now, returning true - will implement in service layer
  return true;
};

// Add staff member
branchSchema.methods.addStaff = function(staffData) {
  this.staff.push(staffData);
  return this.save();
};

// Remove staff member
branchSchema.methods.removeStaff = function(userId) {
  this.staff = this.staff.filter(staff => !staff.userId.equals(userId));
  return this.save();
};

// Update staff permissions
branchSchema.methods.updateStaffPermissions = function(userId, permissions) {
  const staff = this.staff.find(s => s.userId.equals(userId));
  if (staff) {
    staff.permissions = { ...staff.permissions, ...permissions };
    return this.save();
  }
  throw new Error('Staff member not found');
};

// Get active staff count
branchSchema.methods.getActiveStaffCount = function() {
  return this.staff.filter(s => s.isActive).length;
};

// Calculate efficiency score
branchSchema.methods.calculateEfficiency = function() {
  if (this.metrics.totalOrders === 0) return 0;
  
  const completionRate = (this.metrics.completedOrders / this.metrics.totalOrders) * 100;
  const capacityUtilization = (this.metrics.totalOrders / this.capacity.maxOrdersPerDay) * 100;
  const ratingScore = (this.metrics.averageRating / 5) * 100;
  
  return Math.round((completionRate * 0.4 + capacityUtilization * 0.3 + ratingScore * 0.3));
};

// Update metrics
branchSchema.methods.updateMetrics = function(orderData) {
  this.metrics.totalOrders += 1;
  if (orderData.status === 'completed') {
    this.metrics.completedOrders += 1;
  } else if (orderData.status === 'cancelled') {
    this.metrics.cancelledOrders += 1;
  }
  
  if (orderData.amount) {
    this.metrics.totalRevenue += orderData.amount;
    this.metrics.averageOrderValue = this.metrics.totalRevenue / this.metrics.totalOrders;
  }
  
  this.metrics.efficiency = this.calculateEfficiency();
  return this.save();
};

module.exports = mongoose.model('Branch', branchSchema);