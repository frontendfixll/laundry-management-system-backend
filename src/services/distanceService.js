const axios = require('axios');

/**
 * Distance Service - Uses OpenRouteService API for distance calculations
 * Free tier: 2000 requests/day
 * API Docs: https://openrouteservice.org/dev/#/api-docs
 */
class DistanceService {
  constructor() {
    this.apiKey = process.env.OPENROUTE_API_KEY;
    this.baseUrl = 'https://api.openrouteservice.org';
    this.maxRetries = 3;
    this.retryDelays = [1000, 2000, 4000]; // Exponential backoff
  }

  /**
   * Calculate distance between two coordinate points
   * @param {Object} origin - { lat: number, lng: number }
   * @param {Object} destination - { lat: number, lng: number }
   * @returns {Promise<{ distance: number, duration: number, status: string }>}
   */
  async calculateDistance(origin, destination) {
    if (!this.apiKey) {
      console.error('OpenRouteService API key not configured');
      return this.getFallbackResponse('API key not configured');
    }

    // Validate coordinates
    if (!this.validateCoordinates(origin) || !this.validateCoordinates(destination)) {
      return {
        distance: 0,
        duration: 0,
        status: 'INVALID_COORDINATES',
        error: 'Invalid coordinates provided'
      };
    }

    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // OpenRouteService uses [lng, lat] format
        const response = await axios.post(
          `${this.baseUrl}/v2/directions/driving-car`,
          {
            coordinates: [
              [origin.lng, origin.lat],
              [destination.lng, destination.lat]
            ]
          },
          {
            headers: {
              'Authorization': this.apiKey,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (response.data && response.data.routes && response.data.routes.length > 0) {
          const route = response.data.routes[0];
          const summary = route.summary;

          return {
            distance: Math.round((summary.distance / 1000) * 100) / 100, // Convert meters to km, round to 2 decimals
            duration: Math.round(summary.duration / 60), // Convert seconds to minutes
            status: 'OK'
          };
        }

        return this.getFallbackResponse('No route found');

      } catch (error) {
        lastError = error;
        console.error(`Distance API attempt ${attempt + 1} failed:`, error.message);

        // Don't retry on certain errors
        if (error.response?.status === 401) {
          return this.getFallbackResponse('Invalid API key');
        }
        if (error.response?.status === 403) {
          return this.getFallbackResponse('API quota exceeded');
        }

        // Wait before retry
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelays[attempt]);
        }
      }
    }

    console.error('All distance API retries failed:', lastError?.message);
    return this.getFallbackResponse('API unavailable after retries');
  }

  /**
   * Geocode an address to coordinates
   * @param {string} address - Full address string
   * @returns {Promise<{ lat: number, lng: number, status: string }>}
   */
  async geocodeAddress(address) {
    if (!this.apiKey) {
      return { lat: 0, lng: 0, status: 'API_KEY_MISSING' };
    }

    if (!address || address.trim().length < 5) {
      return { lat: 0, lng: 0, status: 'INVALID_ADDRESS' };
    }

    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/geocode/search`,
          {
            params: {
              api_key: this.apiKey,
              text: address,
              'boundary.country': 'IN', // Restrict to India
              size: 1
            },
            timeout: 10000
          }
        );

        if (response.data?.features?.length > 0) {
          const coords = response.data.features[0].geometry.coordinates;
          return {
            lat: coords[1],
            lng: coords[0],
            status: 'OK',
            formattedAddress: response.data.features[0].properties.label
          };
        }

        return { lat: 0, lng: 0, status: 'NOT_FOUND' };

      } catch (error) {
        lastError = error;
        console.error(`Geocoding attempt ${attempt + 1} failed:`, error.message);

        if (error.response?.status === 401 || error.response?.status === 403) {
          return { lat: 0, lng: 0, status: 'API_ERROR' };
        }

        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelays[attempt]);
        }
      }
    }

    console.error('All geocoding retries failed:', lastError?.message);
    return { lat: 0, lng: 0, status: 'API_UNAVAILABLE' };
  }

  /**
   * Calculate distance using address strings (geocodes first)
   * @param {string} originAddress - Origin address string
   * @param {string} destinationAddress - Destination address string
   * @returns {Promise<{ distance: number, duration: number, status: string }>}
   */
  async calculateDistanceFromAddresses(originAddress, destinationAddress) {
    // Geocode origin
    const originCoords = await this.geocodeAddress(originAddress);
    if (originCoords.status !== 'OK') {
      return {
        distance: 0,
        duration: 0,
        status: 'ORIGIN_GEOCODE_FAILED',
        error: `Could not find origin address: ${originAddress}`
      };
    }

    // Geocode destination
    const destCoords = await this.geocodeAddress(destinationAddress);
    if (destCoords.status !== 'OK') {
      return {
        distance: 0,
        duration: 0,
        status: 'DESTINATION_GEOCODE_FAILED',
        error: `Could not find destination address: ${destinationAddress}`
      };
    }

    // Calculate distance
    return this.calculateDistance(
      { lat: originCoords.lat, lng: originCoords.lng },
      { lat: destCoords.lat, lng: destCoords.lng }
    );
  }

  /**
   * Check if distance is within serviceable range
   * @param {number} distance - Distance in kilometers
   * @param {number} maxDistance - Maximum serviceable distance
   * @returns {boolean}
   */
  isServiceable(distance, maxDistance) {
    if (typeof distance !== 'number' || typeof maxDistance !== 'number') {
      return false;
    }
    return distance >= 0 && distance <= maxDistance;
  }

  /**
   * Validate coordinate object
   * @param {Object} coords - { lat: number, lng: number }
   * @returns {boolean}
   */
  validateCoordinates(coords) {
    if (!coords || typeof coords !== 'object') return false;
    
    const { lat, lng } = coords;
    
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (isNaN(lat) || isNaN(lng)) return false;
    if (lat < -90 || lat > 90) return false;
    if (lng < -180 || lng > 180) return false;
    
    return true;
  }

  /**
   * Get fallback response when API fails
   * @param {string} reason - Reason for fallback
   * @returns {Object}
   */
  getFallbackResponse(reason) {
    return {
      distance: 0,
      duration: 0,
      status: 'FALLBACK',
      fallbackReason: reason,
      useFallbackPricing: true
    };
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate straight-line distance using Haversine formula (backup)
   * @param {Object} origin - { lat: number, lng: number }
   * @param {Object} destination - { lat: number, lng: number }
   * @returns {number} Distance in kilometers
   */
  calculateHaversineDistance(origin, destination) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(destination.lat - origin.lat);
    const dLng = this.toRad(destination.lng - origin.lng);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(origin.lat)) * Math.cos(this.toRad(destination.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }
}

// Export singleton instance
module.exports = new DistanceService();
