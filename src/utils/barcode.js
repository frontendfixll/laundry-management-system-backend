/**
 * Barcode Utility Functions
 * Generates and validates barcodes for orders
 */

// Generate a unique barcode for an order
const generateBarcode = (orderId) => {
  // Format: LP + timestamp(6 digits) + random(4 digits) = 12 character barcode
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `LP${timestamp}${random}`;
};

// Validate barcode format
const isValidBarcode = (barcode) => {
  // Barcode should be 12 characters: LP + 6 digits + 4 digits
  const barcodeRegex = /^LP\d{10}$/;
  return barcodeRegex.test(barcode);
};

// Generate barcode data URL for frontend display (Code128 format compatible)
const getBarcodeData = (barcode, orderNumber) => {
  return {
    barcode,
    orderNumber,
    format: 'CODE128', // Standard barcode format
    displayValue: barcode,
    width: 2,
    height: 100,
    fontSize: 14
  };
};

module.exports = {
  generateBarcode,
  isValidBarcode,
  getBarcodeData
};
