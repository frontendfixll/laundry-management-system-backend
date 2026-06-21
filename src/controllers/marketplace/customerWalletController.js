// Customer wallet: balance + ledger. Exposes helpers (creditWallet/debitWallet)
// reused by the referral + order-redeem flows.

const CustomerWallet = require('../../models/CustomerWallet');
const WalletTransaction = require('../../models/WalletTransaction');

async function getOrCreateWallet(userId) {
  let wallet = await CustomerWallet.findOne({ user: userId });
  if (!wallet) wallet = await CustomerWallet.create({ user: userId, balance: 0 });
  return wallet;
}

// Credit the wallet and write a ledger entry. Returns the new balance.
async function creditWallet(userId, amount, reason, opts = {}) {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) return null;
  const wallet = await getOrCreateWallet(userId);
  wallet.balance += amt;
  await wallet.save();
  await WalletTransaction.create({
    user: userId,
    type: 'credit',
    amount: amt,
    reason,
    description: opts.description,
    order: opts.orderId,
    balanceAfter: wallet.balance,
  });
  return wallet.balance;
}

// Debit up to the available balance. Returns the amount actually debited.
async function debitWallet(userId, amount, reason, opts = {}) {
  const requested = Math.round(Number(amount) || 0);
  if (requested <= 0) return 0;
  const wallet = await getOrCreateWallet(userId);
  const debit = Math.min(requested, wallet.balance);
  if (debit <= 0) return 0;
  wallet.balance -= debit;
  await wallet.save();
  await WalletTransaction.create({
    user: userId,
    type: 'debit',
    amount: debit,
    reason,
    description: opts.description,
    order: opts.orderId,
    balanceAfter: wallet.balance,
  });
  return debit;
}

// GET /api/customer-app/wallet
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const wallet = await getOrCreateWallet(userId);
    const transactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('type amount reason description balanceAfter createdAt')
      .lean();

    return res.json({
      success: true,
      wallet: { balance: wallet.balance, currency: wallet.currency },
      transactions,
    });
  } catch (err) {
    console.error('[marketplace] getWallet error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load wallet' });
  }
};

exports.getOrCreateWallet = getOrCreateWallet;
exports.creditWallet = creditWallet;
exports.debitWallet = debitWallet;
