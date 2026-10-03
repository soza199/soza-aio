const mongoose = require('mongoose');

// Saldo fun economy bersifat GLOBAL per user (seperti OwO), terpisah dari sistem
// economy lama (.balance / wallet per server).
const funEconomySchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    cash: { type: Number, default: 0, min: 0 },
    lastDailyDay: { type: Number, default: -1 },
    dailyStreak: { type: Number, default: 0 },
    // Server tempat user pernah memakai command (dipakai untuk ranking per-server, seperti "owo top")
    guildIds: { type: [String], default: [] },
    // Idempotency markers prevent a recovered lottery/blackjack payout from crediting twice.
    lotteryPayoutDays: { type: [Number], default: [] },
    lastBlackjackPayoutId: { type: String, default: null },
    // null = belum terdaftar.
    registeredAt: { type: Date, default: null },
    accountNumber: { type: Number, default: null }
}, { timestamps: true });

funEconomySchema.index({ cash: -1 });
funEconomySchema.index({ guildIds: 1, cash: -1 });

module.exports = mongoose.models.FunEconomy || mongoose.model('FunEconomy', funEconomySchema);
