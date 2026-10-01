const FunEconomy = require('./schema');

const DUPLICATE_KEY = 11000;

/** Pastikan dokumen user ada (aman dari race saat dua command pertama datang bersamaan). */
async function ensureAccount(userId) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await FunEconomy.updateOne(
                { userId },
                { $setOnInsert: { cash: 0 } },
                { upsert: true, setDefaultsOnInsert: true }
            );
            return;
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
        }
    }
}

async function getCash(userId) {
    const doc = await FunEconomy.findOne({ userId }).select('cash').lean();
    return doc?.cash ?? 0;
}

/**
 * Selesaikan taruhan secara ATOMIK dalam satu operasi database:
 * syarat saldo >= bet, lalu saldo berubah sebesar (payout - bet).
 * Return dokumen baru, atau null kalau saldo tidak cukup.
 * Karena hasil langsung tersimpan, animasi di chat hanya kosmetik (aman kalau bot restart).
 */
async function settleBet(userId, bet, payout) {
    return FunEconomy.findOneAndUpdate(
        { userId, cash: { $gte: bet } },
        { $inc: { cash: payout - bet } },
        { new: true }
    ).lean();
}

/** Kurangi saldo secara atomik. Null kalau saldo tidak cukup. */
async function deduct(userId, amount) {
    return FunEconomy.findOneAndUpdate(
        { userId, cash: { $gte: amount } },
        { $inc: { cash: -amount } },
        { new: true }
    ).lean();
}

/** Tambah saldo (membuat akun kalau belum ada). */
async function add(userId, amount) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await FunEconomy.findOneAndUpdate(
                { userId },
                { $inc: { cash: amount } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            ).lean();
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
        }
    }
}

/**
 * Klaim daily. `today` = nomor hari (sudah disesuaikan zona waktu).
 * `amountForStreak(streak)` menentukan hadiah.
 */
async function claimDaily(userId, today, amountForStreak) {
    const existing = await FunEconomy.findOne({ userId }).lean();
    const last = existing?.lastDailyDay ?? -1;
    if (last >= today) return { claimed: false };

    const streak = last === today - 1 ? (existing.dailyStreak || 0) + 1 : 1;
    const amount = amountForStreak(streak);

    await ensureAccount(userId);
    // Filter lastDailyDay < today menjamin tidak bisa klaim dua kali walau command dispam.
    const updated = await FunEconomy.findOneAndUpdate(
        { userId, lastDailyDay: { $lt: today } },
        { $inc: { cash: amount }, $set: { lastDailyDay: today, dailyStreak: streak } },
        { new: true }
    ).lean();

    if (!updated) return { claimed: false };
    return { claimed: true, amount, streak, cash: updated.cash };
}

async function getLastDailyDay(userId) {
    const doc = await FunEconomy.findOne({ userId }).select('lastDailyDay').lean();
    return doc?.lastDailyDay ?? -1;
}

async function top(limit = 10) {
    return FunEconomy.find({ cash: { $gt: 0 } }).sort({ cash: -1 }).limit(limit).lean();
}

module.exports = { getCash, settleBet, deduct, add, claimDaily, getLastDailyDay, top, ensureAccount };
