const mongoose = require('mongoose');

// Saldo fun economy bersifat GLOBAL per user (seperti OwO), terpisah dari sistem
// economy lama (.balance / wallet per server).
const funEconomySchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    cash: { type: Number, default: 0, min: 0 },
    lastDailyDay: { type: Number, default: -1 },
    dailyStreak: { type: Number, default: 0 }
}, { timestamps: true });

funEconomySchema.index({ cash: -1 });

module.exports = mongoose.models.FunEconomy || mongoose.model('FunEconomy', funEconomySchema);
