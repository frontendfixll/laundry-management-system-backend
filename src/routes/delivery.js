const express = require('express');
const router = express.Router();
const distanceService = require('../services/distanceService');
const deliveryPricingService = require('../services/deliveryPricingService');
const Branch = require('../models/Branch');
const Settings = require('../models/Settings');

/**
 * @route   POST /api/delivery/geocode
 * @desc    Geocode an address to coordinates
 * @access  Public
 */
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || address.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Valid address is required'
      });
    }

    const result = await distanceService.geocodeAddress(address);

    if (result.status === 'OK') {
      res.json({
        success: true,
        data: {
          lat: result.lat,
          lng: result.lng,
          formattedAddress: result.formattedAddress
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Could not geocode address',
        status: result.status
      });
    }

  } catch (error) {
    console.error('Geocode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to geocode address'
    });
  }
});

/**
 * @route   POST /api/delivery/calculate-distance
 * @desc    Calculate distance and delivery charge between customer address and branch
 * @access  Public
 */
router.post('/calculate-distance', async (req, res) => {
  try {
    const { pickupAddress, branchId, isExpress = false } = req.body;

    // Validate input
    if (!pickupAddress) {
      return res.status(400).json({
        success: false,
        message: 'Pickup address is required'
      });
    }

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: 'Branch ID is required'
      });
    }

    // Get branch with coordinates
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Check if branch has coordinates
    if (!branch.coordinates?.latitude || !branch.coordinates?.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Branch coordinates not configured. Please contact support.',
        useFallback: true
      });
    }

    // Get pricing config from settings
    const pricingConfig = await Settings.getDeliveryPricing();

    // Build full address string for geocoding
    let addressString = pickupAddress;
    if (typeof pickupAddress === 'object') {
      addressString = [
        pickupAddress.addressLine1,
        pickupAddress.addressLine2,
        pickupAddress.landmark,
        pickupAddress.city,
        pickupAddress.pincode,
        'India'
      ].filter(Boolean).join(', ');
    }

    // Calculate distance
    const distanceResult = await distanceService.calculateDistanceFromAddresses(
      addressString,
      `${branch.address.addressLine1}, ${branch.address.city}, ${branch.address.pincode}, India`
    );

    // If API failed, use fallback pricing
    if (distanceResult.status !== 'OK' || distanceResult.useFallbackPricing) {
      const fallback = deliveryPricingService.getFallbackCharge(isExpress);
      return res.json({
        success: true,
        data: {
          distance: null,
          deliveryCharge: fallback.charge,
          isServiceable: true,
          isFallback: true,
          message: fallback.breakdown.message,
          branch: {
            id: branch._id,
            name: branch.name,
            code: branch.code
          }
        }
      });
    }

    // Calculate delivery charge
    const chargeResult = deliveryPricingService.calculateDeliveryCharge(
      distanceResult.distance,
      pricingConfig,
      isExpress
    );

    res.json({
      success: true,
      data: {
        distance: distanceResult.distance,
        duration: distanceResult.duration,
        deliveryCharge: chargeResult.charge,
        isServiceable: chargeResult.isServiceable,
        isFallback: false,
        breakdown: chargeResult.breakdown,
        branch: {
          id: branch._id,
          name: branch.name,
          code: branch.code
        },
        message: chargeResult.isServiceable 
          ? (chargeResult.breakdown.calculationMethod === 'FREE_ZONE' 
              ? 'Free delivery!' 
              : `₹${chargeResult.charge} delivery charge for ${distanceResult.distance} km`)
          : `Sorry, we don't deliver to this location. Maximum distance is ${pricingConfig.maxDistance} km.`
      }
    });

  } catch (error) {
    console.error('Distance calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate distance',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/delivery/pricing-info
 * @desc    Get current delivery pricing configuration for customers
 * @access  Public
 */
router.get('/pricing-info', async (req, res) => {
  try {
    const pricingConfig = await Settings.getDeliveryPricing();

    res.json({
      success: true,
      data: {
        baseDistance: pricingConfig.baseDistance,
        perKmRate: pricingConfig.perKmRate,
        maxDistance: pricingConfig.maxDistance,
        minimumCharge: pricingConfig.minimumCharge,
        expressMultiplier: pricingConfig.expressMultiplier,
        message: `Free delivery within ${pricingConfig.baseDistance} km. ₹${pricingConfig.perKmRate}/km after that. Maximum ${pricingConfig.maxDistance} km.`
      }
    });

  } catch (error) {
    console.error('Get pricing info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pricing info'
    });
  }
});

/**
 * @route   POST /api/delivery/calculate-by-coordinates
 * @desc    Calculate distance using coordinates directly (for when customer location is known)
 * @access  Public
 */
router.post('/calculate-by-coordinates', async (req, res) => {
  try {
    const { customerLat, customerLng, branchId, isExpress = false } = req.body;

    // Validate coordinates
    if (!distanceService.validateCoordinates({ lat: customerLat, lng: customerLng })) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer coordinates'
      });
    }

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: 'Branch ID is required'
      });
    }

    // Get branch
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    if (!branch.coordinates?.latitude || !branch.coordinates?.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Branch coordinates not configured'
      });
    }

    // Get pricing config
    const pricingConfig = await Settings.getDeliveryPricing();

    // Calculate distance
    const distanceResult = await distanceService.calculateDistance(
      { lat: customerLat, lng: customerLng },
      { lat: branch.coordinates.latitude, lng: branch.coordinates.longitude }
    );

    if (distanceResult.status !== 'OK') {
      const fallback = deliveryPricingService.getFallbackCharge(isExpress);
      return res.json({
        success: true,
        data: {
          distance: null,
          deliveryCharge: fallback.charge,
          isServiceable: true,
          isFallback: true,
          message: fallback.breakdown.message
        }
      });
    }

    // Calculate charge
    const chargeResult = deliveryPricingService.calculateDeliveryCharge(
      distanceResult.distance,
      pricingConfig,
      isExpress
    );

    res.json({
      success: true,
      data: {
        distance: distanceResult.distance,
        duration: distanceResult.duration,
        deliveryCharge: chargeResult.charge,
        isServiceable: chargeResult.isServiceable,
        breakdown: chargeResult.breakdown
      }
    });

  } catch (error) {
    console.error('Coordinate distance calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate distance'
    });
  }
});

module.exports = router;
