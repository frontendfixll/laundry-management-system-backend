const Address = require('../models/Address');

// Get all addresses for the authenticated user
const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ 
      userId: req.user._id, 
      isActive: true 
    }).sort({ isDefault: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        addresses,
        count: addresses.length
      }
    });

  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses'
    });
  }
};

// Get a specific address
const getAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { address }
    });

  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch address'
    });
  }
};

// Add a new address
const addAddress = async (req, res) => {
  try {
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pincode,
      addressType,
      isDefault
    } = req.body;

    // Check if this is the user's first address
    const existingAddressCount = await Address.countDocuments({
      userId: req.user._id,
      isActive: true
    });

    const address = new Address({
      userId: req.user._id,
      name,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pincode,
      addressType,
      isDefault: existingAddressCount === 0 ? true : isDefault // First address is always default
    });

    await address.save();

    res.status(201).json({
      success: true,
      message: 'Address added successfully!',
      data: { address }
    });

  } catch (error) {
    console.error('Add address error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to add address'
    });
  }
};

// Update an existing address
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pincode,
      addressType,
      isDefault
    } = req.body;

    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update fields
    if (name !== undefined) address.name = name;
    if (phone !== undefined) address.phone = phone;
    if (addressLine1 !== undefined) address.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2;
    if (landmark !== undefined) address.landmark = landmark;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (pincode !== undefined) address.pincode = pincode;
    if (addressType !== undefined) address.addressType = addressType;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await address.save();

    res.status(200).json({
      success: true,
      message: 'Address updated successfully!',
      data: { address }
    });

  } catch (error) {
    console.error('Update address error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update address'
    });
  }
};

// Delete an address (soft delete)
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Check if this is the default address
    if (address.isDefault) {
      // Check if there are other addresses
      const otherAddresses = await Address.find({
        userId: req.user._id,
        _id: { $ne: id },
        isActive: true
      }).sort({ createdAt: -1 });

      if (otherAddresses.length > 0) {
        // Make the most recent address the new default
        otherAddresses[0].isDefault = true;
        await otherAddresses[0].save();
      }
    }

    // Soft delete the address
    address.isActive = false;
    await address.save();

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully!'
    });

  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address'
    });
  }
};

// Set an address as default
const setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    if (address.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Address is already set as default'
      });
    }

    // Set this address as default (pre-save middleware will handle removing default from others)
    address.isDefault = true;
    await address.save();

    res.status(200).json({
      success: true,
      message: 'Default address updated successfully!',
      data: { address }
    });

  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address'
    });
  }
};

module.exports = {
  getAddresses,
  getAddress,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};