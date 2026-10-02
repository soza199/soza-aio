const mongoose = require('mongoose');

// Satu dokumen per (hari, user). `day` = nomor hari sesuai TIMEZONE_OFFSET_HOURS.
const entrySchema = new mongoose.Schema({
    day: { type: Number, required: true },
    userId: { type: String, required: true },
    amount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });
entrySchema.index({ day: 1, userId: 1 }, { unique: true });

// Hasil undian per hari. Dokumen ini sekaligus "kunci" supaya satu hari hanya diundi sekali.
const resultSchema = new mongoose.Schema({
    day: { type: Number, required: true, unique: true },
    winnerId: { type: String, default: null },
    pool: { type: Number, default: 0 },
    participants: { type: Number, default: 0 },
    paid: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = {
    Entry: mongoose.models.FunLotteryEntry || mongoose.model('FunLotteryEntry', entrySchema),
    Result: mongoose.models.FunLotteryResult || mongoose.model('FunLotteryResult', resultSchema)
};