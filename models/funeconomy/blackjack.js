const mongoose = require('mongoose');

// Satu game blackjack aktif per user. Disimpan di database supaya tombol tetap berfungsi
// setelah bot restart dan game bisa dilanjutkan dengan mengetik ulang "sbj" (seperti OwO).
// Kartu disimpan sebagai angka 0-51: rank = n % 13 (0 = As), suit = floor(n / 13).
const blackjackSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    bet: { type: Number, required: true, min: 1 },
    deck: { type: [Number], default: [] },
    player: { type: [Number], default: [] },
    dealer: { type: [Number], default: [] },
    outcome: { type: String, enum: ['win', 'lose', 'push'], default: null },
    payout: { type: Number, default: 0, min: 0 },
    natural: { type: Boolean, default: false },
    bust: { type: Boolean, default: false },
    dealerBust: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.FunBlackjack || mongoose.model('FunBlackjack', blackjackSchema);