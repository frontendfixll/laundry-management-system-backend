const Lead = require('../models/Lead');
const SalesUser = require('../models/SalesUser');
const { sendSuccess, sendError } = require('../utils/helpers');

/**
 * @route   POST /api/public/leads
 * @desc    Create a new lead from marketing website (public endpoint)
 * @access  Public
 */
exports.createPublicLead = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      businessName,
      businessType,
      interestedPlan,
      expectedMonthlyOrders,
      currentBranches,
      address,
      message,
      source
    } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !businessName || !businessType) {
      return sendError(res, null, 'Missing required fields', 400);
    }

    // Calculate initial lead score based on provided information
    let score = 50; // Base score

    // Score adjustments
    if (interestedPlan === 'enterprise') score += 20;
    else if (interestedPlan === 'pro') score += 15;
    else if (interestedPlan === 'basic') score += 10;

    if (expectedMonthlyOrders === '5000+') score += 15;
    else if (expectedMonthlyOrders === '1000-5000') score += 10;
    else if (expectedMonthlyOrders === '500-1000') score += 5;

    if (currentBranches > 5) score += 10;
    else if (currentBranches > 2) score += 5;

    if (address && address.city) score += 5;

    // Auto-assign to available sales user (round-robin or least loaded)
    const salesUser = await findAvailableSalesUser();

    // Create lead
    const lead = new Lead({
      businessName,
      businessType,
      contactPerson: {
        name,
        email,
        phone
      },
      address: address || {},
      status: 'new',
      source: source || 'website',
      interestedPlan: interestedPlan || 'undecided',
      estimatedRevenue: calculateEstimatedRevenue(interestedPlan, expectedMonthlyOrders),
      requirements: {
        numberOfBranches: currentBranches || 1,
        expectedOrders: parseExpectedOrders(expectedMonthlyOrders),
        notes: message || ''
      },
      priority: determinePriority(score),
      score: Math.min(score, 100),
      assignedTo: salesUser ? salesUser._id : null,
      assignedDate: salesUser ? new Date() : null,
      followUpNotes: message ? [{
        note: `Initial inquiry: ${message}`,
        createdAt: new Date()
      }] : []
    });

    await lead.save();

    // Update sales user performance if assigned
    if (salesUser) {
      await salesUser.updatePerformance({
        leadsAssigned: salesUser.performance.leadsAssigned + 1
      });
      
      console.log(`✅ Lead assigned to sales user: ${salesUser.name} (${salesUser.email})`);
    }

    sendSuccess(res, { leadId: lead._id }, 'Lead created successfully. Our team will contact you soon!', 201);
  } catch (error) {
    console.error('❌ Error creating public lead:', error);
    sendError(res, error, 'Failed to submit lead. Please try again.', 500);
  }
};

// Helper function to find available sales user
async function findAvailableSalesUser() {
  try {
    // Find active sales users and sort by least assigned leads
    const salesUsers = await SalesUser.find({ 
      isActive: true 
    }).sort({ 
      'performance.leadsAssigned': 1 // Ascending order - least loaded first
    });

    if (salesUsers.length === 0) {
      console.log('⚠️ No active sales users found for lead assignment');
      return null;
    }

    // Return the sales user with least assigned leads
    return salesUsers[0];
  } catch (error) {
    console.error('❌ Error finding available sales user:', error);
    return null;
  }
}

// Helper functions
function calculateEstimatedRevenue(plan, orderVolume) {
  const planPrices = {
    basic: 999,
    pro: 2999,
    enterprise: 9999
  };

  const basePrice = planPrices[plan] || 999;
  
  // Multiply by 12 for annual revenue
  return basePrice * 12;
}

function parseExpectedOrders(orderVolume) {
  if (!orderVolume) return 0;
  
  const ranges = {
    '0-100': 50,
    '100-500': 300,
    '500-1000': 750,
    '1000-5000': 3000,
    '5000+': 7500
  };

  return ranges[orderVolume] || 0;
}

function determinePriority(score) {
  if (score >= 80) return 'urgent';
  if (score >= 65) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}
