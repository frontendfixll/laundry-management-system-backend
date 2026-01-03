const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit phone number']
  },
  addressLine1: {
    type: String,
    required: [true, 'Address line 1 is required'],
    trim: true,
    maxlength: [100, 'Address line 1 cannot exceed 100 characters']
  },
  addressLine2: {
    type: String,
    trim: true,
    maxlength: [100, 'Address line 2 cannot exceed 100 characters']
  },
  landmark: {
    type: String,
    trim: true,
    maxlength: [50, 'Landmark cannot exceed 50 characters']
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: [50, 'City cannot exceed 50 characters']
  },
  state: {
    type: String,
    trim: true,
    maxlength: [50, 'State cannot exceed 50 characters'],
    default: 'India'
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    match: [/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit pincode']
  },
  addressType: {
    type: String,
    enum: ['home', 'office', 'other'],
    default: 'home'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for performance
addressSchema.index({ userId: 1 });
addressSchema.index({ userId: 1, isDefault: 1 });
addressSchema.index({ userId: 1, isActive: 1 });

// Ensure only one default address per user
addressSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    // Remove default flag from other addresses of the same user
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// Virtual for full address
addressSchema.virtual('fullAddress').get(function() {
  let address = this.addressLine1;
  if (this.addressLine2) address += ', ' + this.addressLine2;
  if (this.landmark) address += ', ' + this.landmark;
  address += ', ' + this.city;
  if (this.state) address += ', ' + this.state;
  address += ' - ' + this.pincode;
  return address;
});

// Ensure virtual fields are serialized
addressSchema.set('toJSON', { virtuals: true });
addressSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Address', addressSchema);