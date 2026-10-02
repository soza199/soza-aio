const crypto = require('crypto');
const cfg = require('./config');
const Economy = require('../models/funeconomy/economy');
const { Entry, Result } = require('../models/funeconomy/lottery');
const { dayNumber, msUntilReset } = require('./commands/daily')._internals;
const { fmt, sleep } = require('./utils');

const DUPLICATE_KEY = 11000;

/** Total taruhan user + total pool + jumlah peserta untuk satu hari. */
async function getStatus(day, userId) {
    const mine = await Entry.findOne({ day, userId }).select('amount').lean();
    const [totals] = await Entry.aggregate([
        { $match: { day, amount: { $gt: 0 } } },
        { $group: { _id: null, pool: { $sum: '$amount' }, players: { $sum: 1 } } }
    ]);
    return { mine: mine?.amount ?? 0, pool: totals?.pool ?? 0, players: totals?.players ?? 0 };
}

async function ensureEntry(day, userId) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await Entry.updateOne({ day, userId }, { $setOnInsert: { amount: 0 } }, { upsert: true });
            return;
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
        }
    }
}

/**
 * Tambah taruhan secara atomik. Null kalau total user akan melewati batas per lottery.
 * Saldo harus sudah dipotong oleh pemanggil (dan dikembalikan kalau hasilnya null).
 */
async function addEntry(day, userId, amount) {
    await ensureEntry(day, userId);
    return Entry.findOneAndUpdate(
        { day, userId, amount: { $lte: cfg.LOTTERY.MAX_PER_LOTTERY - amount } },
        { $inc: { amount } },
        { new: true }
    ).lean();
}

// ---------------------------------------------------------------------------
// Undian
// ---------------------------------------------------------------------------
async function dm(client, userId, content) {
    try {
        const user = await client.users.fetch(userId);
        await user.send({ content, allowedMentions: { parse: [] } });
    } catch { /* DM tertutup / user tidak ditemukan */ }
}

async function payWinner(client, day, winnerId, pool) {
    // Idempotent marker is stored with the balance update, so restart recovery cannot pay twice.
    await Economy.addLotteryPayout(winnerId, day, pool);
    await Result.updateOne({ day }, { $set: { paid: true } });
    await dm(client, winnerId,
        `🎉 | You won the lottery! **${cfg.CASH_EMOJI} ${fmt(pool)}** ${cfg.CASH_NAME} has been added to your balance.`);
}

/** Undi satu hari. Aman dipanggil berulang: dokumen Result menjadi kunci. */
async function settleDay(client, day) {
    if (await Result.exists({ day })) return;

    const entries = await Entry.find({ day, amount: { $gt: 0 } }).lean();
    const pool = entries.reduce((sum, e) => sum + e.amount, 0);

    let winnerId = null;
    if (pool > 0) {
        // crypto.randomInt dibatasi < 2^48; pool sebesar itu tidak akan terjadi di praktik
        let roll = pool <= 2 ** 47 ? crypto.randomInt(pool) : Math.floor(Math.random() * pool);
        for (const entry of entries) {
            if (roll < entry.amount) { winnerId = entry.userId; break; }
            roll -= entry.amount;
        }
    }

    let claimed;
    try {
        const res = await Result.updateOne(
            { day },
            { $setOnInsert: { day, winnerId, pool, participants: entries.length, paid: !winnerId } },
            { upsert: true }
        );
        claimed = res.upsertedCount === 1;
    } catch (error) {
        if (error?.code === DUPLICATE_KEY) return;
        throw error;
    }
    if (!claimed || !winnerId) return;

    await payWinner(client, day, winnerId, pool);

    if (cfg.LOTTERY.DM_LOSERS) {
        for (const entry of entries) {
            if (entry.userId === winnerId) continue;
            await dm(client, entry.userId,
                `🎟️ | The lottery ended and you didn't win this time. Better luck next time!`);
            await sleep(1500);
        }
    }
}

/** Undi semua hari yang sudah lewat. */
async function settleDue(client) {
    const days = await Entry.distinct('day', { day: { $lt: dayNumber() } });
    for (const day of days.sort((a, b) => a - b)) {
        await settleDay(client, day);
    }
}

/** Setelah bot mati di tengah proses: bayar pemenang yang sudah diundi tapi belum dibayar. */
async function recoverUnpaid(client) {
    const unpaid = await Result.find({ paid: false, winnerId: { $ne: null } }).lean();
    for (const result of unpaid) {
        await payWinner(client, result.day, result.winnerId, result.pool);
    }
}

let timer = null;

/** Jalankan undian otomatis tiap pergantian hari (dan susul yang terlewat saat bot mati). */
function startScheduler(client) {
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(tick, msUntilReset() + 2000);
        timer.unref?.(); // jangan menahan proses tetap hidup; client Discord yang menjaganya
    };
    const tick = async () => {
        try { await settleDue(client); }
        catch (error) { console.error('[FUNECONOMY] Lottery settle failed:', error); }
        schedule();
    };

    (async () => {
        try {
            await recoverUnpaid(client);
            await settleDue(client);
        } catch (error) {
            console.error('[FUNECONOMY] Lottery startup failed:', error);
        }
        schedule();
    })();
}

module.exports = { dayNumber, msUntilReset, getStatus, addEntry, settleDue, settleDay, startScheduler };