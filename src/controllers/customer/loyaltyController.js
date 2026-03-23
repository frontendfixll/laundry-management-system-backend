const { LoyaltyProgram, LoyaltyMember, LoyaltyTransaction } = require('../../models/LoyaltyProgram');

// Get customer's loyalty balance and tier info
const getLoyaltyBalance = async (req, res) => {
  try {
    const userId = req.user._id;
    const tenancyId = req.user.tenancy;
    
    console.log('========================================');
    console.log('LOYALTY BALANCE REQUEST');
    console.log('User ID:', userId);
    console.log('User Tenancy ID:', tenancyId);
    console.log('Current Date:', new Date());
    console.log('========================================');
    
    // Find active loyalty program for tenancy
    const program = await LoyaltyProgram.findOne({
      tenancy: tenancyId,
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [
        { endDate: { $gte: new Date() } },
        { endDate: null }
      ]
    });
    
    console.log('Program Found:', program ? 'YES' : 'NO');
    if (program) {
      console.log('Program Details:');
      console.log('  - Name:', program.name);
      console.log('  - ID:', program._id);
      console.log('  - Tenancy:', program.tenancy);
      console.log('  - Type:', program.type);
      console.log('  - Active:', program.isActive);
      console.log('  - Start Date:', program.startDate);
      console.log('  - End Date:', program.endDate);
    } else {
      console.log('No program found - checking all programs for this tenancy...');
      const allPrograms = await LoyaltyProgram.find({ tenancy: tenancyId });
      console.log('Total programs for this tenancy:', allPrograms.length);
      allPrograms.forEach(p => {
        console.log(`  - ${p.name}: Active=${p.isActive}, Start=${p.startDate}, End=${p.endDate}`);
      });
    }
    console.log('========================================');
    
    if (!program) {
      return res.json({
        success: true,
        data: {
          enrolled: false,
          message: 'No active loyalty program available'
        }
      });
    }
    
    // Find member record
    const member = await LoyaltyMember.findOne({
      program: program._id,
      user: userId,
      tenancy: tenancyId
    }).populate('program', 'name type pointsConfig tiers');
    
    console.log('Member Found:', member ? 'YES' : 'NO');
    if (member) {
      console.log('Member Details:');
      console.log('  - ID:', member._id);
      console.log('  - User:', member.user);
      console.log('  - Program:', member.program?._id);
      console.log('  - Points Balance:', member.pointsBalance);
      console.log('  - Lifetime Points:', member.lifetimePoints);
    }
    console.log('========================================');
    
    if (!member) {
      return res.json({
        success: true,
        data: {
          enrolled: false,
          program: {
            _id: program._id,
            name: program.name,
            type: program.type
          },
          canEnroll: true
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        enrolled: true,
        pointsBalance: member.pointsBalance,
        lifetimePoints: member.lifetimePoints,
        redeemedPoints: member.redeemedPoints,
        currentTier: member.currentTier,
        totalSpent: member.totalSpent,
        totalOrders: member.totalOrders,
        program: {
          _id: program._id,
          name: program.name,
          type: program.type,
          pointsConfig: program.pointsConfig,
          tiers: program.tiers
        }
      }
    });
    
    console.log('✅ Sent enrolled response with', member.pointsBalance, 'points');
    console.log('========================================');
  } catch (error) {
    console.error('Get loyalty balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loyalty balance'
    });
  }
};

// Get loyalty transaction history
const getLoyaltyTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const tenancyId = req.user.tenancy;
    const { page = 1, limit = 20, type } = req.query;
    
    // Find member
    const member = await LoyaltyMember.findOne({
      user: userId,
      tenancy: tenancyId
    });
    
    if (!member) {
      return res.json({
        success: true,
        data: {
          transactions: [],
          pagination: { current: 1, pages: 0, total: 0 }
        }
      });
    }
    
    // Build filter
    const filter = {
      member: member._id,
      tenancy: tenancyId
    };
    
    if (type) {
      filter.type = type;
    }
    
    const transactions = await LoyaltyTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('order', 'orderNumber totalAmount');
    
    const total = await LoyaltyTransaction.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get loyalty transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loyalty transactions'
    });
  }
};

// Enroll in loyalty program
const enrollInLoyalty = async (req, res) => {
  try {
    const userId = req.user._id;
    const tenancyId = req.user.tenancy;
    
    // Find active program
    const program = await LoyaltyProgram.findOne({
      tenancy: tenancyId,
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [
        { endDate: { $gte: new Date() } },
        { endDate: null }
      ]
    });
    
    if (!program || !program.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'No active loyalty program available'
      });
    }
    
    // Check if already enrolled
    const existingMember = await LoyaltyMember.findOne({
      program: program._id,
      user: userId
    });
    
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'Already enrolled in loyalty program'
      });
    }
    
    // Create member
    const member = new LoyaltyMember({
      tenancy: tenancyId,
      program: program._id,
      user: userId,
      enrollmentSource: 'manual'
    });
    
    // Give welcome bonus if configured
    if (program.welcomeBonus) {
      if (program.welcomeBonus.points > 0) {
        member.pointsBalance = program.welcomeBonus.points;
        member.lifetimePoints = program.welcomeBonus.points;
        
        // Create transaction
        await LoyaltyTransaction.create({
          tenancy: tenancyId,
          program: program._id,
          member: member._id,
          user: userId,
          type: 'earned',
          points: program.welcomeBonus.points,
          earningSource: 'welcome_bonus',
          description: 'Welcome bonus for joining loyalty program'
        });
      }
      
      if (program.welcomeBonus.credit > 0) {
        // Add wallet credit (if wallet exists)
        const User = require('../../models/User');
        const user = await User.findById(userId);
        if (user) {
          if (!user.wallet) user.wallet = { balance: 0 };
          user.wallet.balance += program.welcomeBonus.credit;
          await user.save();

          // Notify customer about wallet credit
          try {
            const NotificationService = require('../../services/notificationService');
            await NotificationService.notifyWalletCredited(userId, program.welcomeBonus.credit, 'Welcome bonus for joining loyalty program', tenancyId);
          } catch (err) {
            console.log('Failed to send wallet credit notification:', err.message);
          }
        }
      }
    }
    
    await member.save();
    
    // Update program stats
    program.totalMembers += 1;
    program.activeMembers += 1;
    await program.save();
    
    res.status(201).json({
      success: true,
      message: 'Successfully enrolled in loyalty program',
      data: { member }
    });
  } catch (error) {
    console.error('Enroll in loyalty error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll in loyalty program'
    });
  }
};

// Redeem loyalty points
const redeemPoints = async (req, res) => {
  try {
    const userId = req.user._id;
    const tenancyId = req.user.tenancy;
    const { points, redemptionType, value } = req.body;
    
    if (!points || points <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid points amount'
      });
    }
    
    // Find member
    const member = await LoyaltyMember.findOne({
      user: userId,
      tenancy: tenancyId,
      isActive: true
    }).populate('program');
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Not enrolled in loyalty program'
      });
    }
    
    // Redeem points
    try {
      await member.redeemPoints(points, redemptionType, value);
      
      // Add value to wallet for discount/credit redemptions
      if (redemptionType === 'discount' || redemptionType === 'credit') {
        const User = require('../../models/User');
        const user = await User.findById(userId);
        
        if (user) {
          // Initialize wallet if doesn't exist
          if (!user.wallet) {
            user.wallet = {
              balance: 0,
              transactions: []
            };
          }
          
          // Add credit to wallet
          user.wallet.balance += value;
          
          // Add transaction record
          user.wallet.transactions.push({
            type: 'credit',
            amount: value,
            description: `Loyalty points redemption - ${points} points`,
            date: new Date(),
            source: 'loyalty_redemption',
            balanceAfter: user.wallet.balance
          });
          
          await user.save();

          console.log(`✅ Added ₹${value} to wallet for user ${userId} (${points} points redeemed)`);

          // Notify customer about wallet credit from redemption
          try {
            const NotificationService = require('../../services/notificationService');
            await NotificationService.notifyWalletCredited(userId, value, `Redeemed ${points} loyalty points`, tenancyId);
          } catch (err) {
            console.log('Failed to send wallet credit notification:', err.message);
          }
        }
      }

      res.json({
        success: true,
        message: 'Points redeemed successfully',
        data: {
          pointsRedeemed: points,
          remainingBalance: member.pointsBalance,
          redemptionType,
          value,
          walletCreditAdded: (redemptionType === 'discount' || redemptionType === 'credit') ? value : 0
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  } catch (error) {
    console.error('Redeem points error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to redeem points'
    });
  }
};

// Get available rewards
const getAvailableRewards = async (req, res) => {
  try {
    const userId = req.user._id;
    const tenancyId = req.user.tenancy;
    
    console.log('========================================');
    console.log('GET AVAILABLE REWARDS');
    console.log('User ID:', userId);
    console.log('Tenancy ID:', tenancyId);
    
    // Find member
    const member = await LoyaltyMember.findOne({
      user: userId,
      tenancy: tenancyId
    }).populate('program');
    
    console.log('Member Found:', member ? 'YES' : 'NO');
    
    if (!member) {
      console.log('No member found - returning empty rewards');
      console.log('========================================');
      return res.json({
        success: true,
        data: { rewards: [] }
      });
    }
    
    const program = member.program;
    const pointsBalance = member.pointsBalance;
    
    console.log('Program:', program.name);
    console.log('Program Type:', program.type);
    console.log('Points Balance:', pointsBalance);
    console.log('Has pointsConfig:', !!program.pointsConfig);
    console.log('Redemption Options:', program.pointsConfig?.redemptionOptions?.length || 0);
    
    // Build rewards catalog based on program type
    const rewards = [];
    
    // Points-based rewards
    if (program.type === 'points' && program.pointsConfig) {
      const redemptionOptions = program.pointsConfig.redemptionOptions || [];
      
      console.log('Processing', redemptionOptions.length, 'redemption options...');
      
      redemptionOptions.forEach(option => {
        console.log('  -', option.name, ':', option.pointsRequired, 'points');
        rewards.push({
          id: option._id,
          name: option.name,
          description: option.description,
          pointsRequired: option.pointsRequired,
          value: option.value,
          type: option.type,
          canRedeem: pointsBalance >= option.pointsRequired,
          category: 'points_reward'
        });
      });
    }
    
    console.log('Total rewards built:', rewards.length);
    console.log('========================================');
    
    // Tier-based rewards
    if (program.type === 'tiered' && member.currentTier) {
      const tier = program.tiers.find(t => t.name === member.currentTier.name);
      if (tier && tier.benefits) {
        tier.benefits.forEach(benefit => {
          rewards.push({
            name: benefit.name,
            description: benefit.description,
            type: 'tier_benefit',
            canRedeem: true,
            category: 'tier_reward'
          });
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        rewards,
        pointsBalance,
        currentTier: member.currentTier
      }
    });
  } catch (error) {
    console.error('Get available rewards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available rewards'
    });
  }
};

// Get tier information
const getTierInfo = async (req, res) => {
  try {
    const userId = req.user._id;
    const tenancyId = req.user.tenancy;
    
    // Find member
    const member = await LoyaltyMember.findOne({
      user: userId,
      tenancy: tenancyId
    }).populate('program');
    
    if (!member || member.program.type !== 'tiered') {
      return res.json({
        success: true,
        data: {
          hasTiers: false,
          message: 'No tiered loyalty program available'
        }
      });
    }
    
    const program = member.program;
    const currentTier = member.currentTier;
    const tiers = program.tiers || [];
    
    // Find current tier index
    const currentTierIndex = tiers.findIndex(t => t.name === currentTier.name);
    const nextTier = currentTierIndex < tiers.length - 1 ? tiers[currentTierIndex + 1] : null;
    
    // Calculate progress to next tier
    let progressToNextTier = null;
    if (nextTier) {
      const currentPoints = member.lifetimePoints;
      const nextTierPoints = nextTier.minPoints;
      const currentTierPoints = currentTier.minPoints || 0;
      
      progressToNextTier = {
        currentPoints,
        pointsNeeded: nextTierPoints - currentPoints,
        totalPointsForNextTier: nextTierPoints,
        percentage: Math.min(100, ((currentPoints - currentTierPoints) / (nextTierPoints - currentTierPoints)) * 100)
      };
    }
    
    res.json({
      success: true,
      data: {
        hasTiers: true,
        currentTier: {
          name: currentTier.name,
          minPoints: currentTier.minPoints,
          benefits: currentTier.benefits,
          discountPercentage: currentTier.discountPercentage
        },
        nextTier: nextTier ? {
          name: nextTier.name,
          minPoints: nextTier.minPoints,
          benefits: nextTier.benefits,
          discountPercentage: nextTier.discountPercentage
        } : null,
        progressToNextTier,
        allTiers: tiers.map(t => ({
          name: t.name,
          minPoints: t.minPoints,
          discountPercentage: t.discountPercentage,
          isCurrentTier: t.name === currentTier.name
        }))
      }
    });
  } catch (error) {
    console.error('Get tier info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tier information'
    });
  }
};

module.exports = {
  getLoyaltyBalance,
  getLoyaltyTransactions,
  enrollInLoyalty,
  redeemPoints,
  getAvailableRewards,
  getTierInfo
};
