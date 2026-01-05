/**
 * Barcode Utility Functions
 * Generates and validates barcodes for orders and item tags
 */

// Generate a unique barcode for an order
const generateBarcode = (orderId) => {
  // Format: LP + timestamp(6 digits) + random(4 digits) = 12 character barcode
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `LP${timestamp}${random}`;
};

// Generate a unique tag code for an item
const generateItemTag = () => {
  // Format: IT + timestamp(6 digits) + random(4 digits) = 12 character tag
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `IT${timestamp}${random}`;
};

// Validate barcode format (order barcode)
const isValidBarcode = (barcode) => {
  // Barcode should be 12 characters: LP + 6 digits + 4 digits
  const barcodeRegex = /^LP\d{10}$/;
  return barcodeRegex.test(barcode);
};

// Validate item tag format
const isValidItemTag = (tagCode) => {
  // Tag should be 12 characters: IT + 6 digits + 4 digits
  const tagRegex = /^IT\d{10}$/;
  return tagRegex.test(tagCode);
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

// Generate item tag data for printing
const getItemTagData = (item, order, customer) => {
  return {
    tagCode: item.tagCode,
    orderNumber: order.orderNumber,
    orderBarcode: order.barcode,
    itemType: item.itemType,
    service: item.service,
    category: item.category,
    customerName: customer?.name || 'N/A',
    customerPhone: customer?.phone || 'N/A',
    specialInstructions: item.specialInstructions || '',
    createdAt: item.createdAt,
    // QR code data (JSON string)
    qrData: JSON.stringify({
      tagCode: item.tagCode,
      orderNumber: order.orderNumber,
      itemType: item.itemType,
      service: item.service,
      customer: customer?.name || 'N/A'
    }),
    // Barcode settings
    barcodeFormat: 'CODE128',
    barcodeWidth: 1.5,
    barcodeHeight: 40,
    fontSize: 10
  };
};

// Generate print-ready label data for multiple items
const generatePrintLabels = (items, order, customer) => {
  return items.map((item, index) => ({
    ...getItemTagData(item, order, customer),
    itemNumber: index + 1,
    totalItems: items.length,
    printDate: new Date().toISOString()
  }));
};

module.exports = {
  generateBarcode,
  generateItemTag,
  isValidBarcode,
  isValidItemTag,
  getBarcodeData,
  getItemTagData,
  generatePrintLabels
};
