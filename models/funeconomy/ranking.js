const FunEconomy = require('./schema');
const { levelFromXp } = require('../../funeconomy/leveling');

const DUPLICATE_KEY = 11000;

// ---------------------------------------------------------------------------
// Pelacakan server (supaya "top" per-server bisa dihitung)
// ---------------------------------------------------------------------------
const seen = new Set();
const backfilled = new Map(); // guildId -> { ok, at }
const RETRY_BACKFILL_MS = 10 * 60 * 1000;

/** Catat bahwa user aktif di server ini. Murah: hanya menulis sekali per proses per (user, server). */
async function touchGuild(userId, guildId) {
    const key = `${userId}:${guildId}`;
    if (seen.has(key)) return;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await FunEconomy.updateOne(
                { userId },
                { $addToSet: { guildIds: guildId }, $setOnInsert: { cash: 0 } },
                { upsert: true, setDefaultsOnInsert: true }
            );
            if (seen.size > 50000) seen.clear();
            seen.add(key);
            return;
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
        }
    }
}

/**
 * Isi guildIds untuk akun lama berdasarkan daftar member server (sekali per server per proses),
 * supaya "top" per-server langsung akurat tanpa menunggu semua orang memakai command lagi.
 */
async function backfillGuild(guild) {
    const previous = backfilled.get(guild.id);
    if (previous && (previous.ok || Date.now() - previous.at < RETRY_BACKFILL_MS)) return;
    backfilled.set(guild.id, { ok: false, at: Date.now() });

    try {
        const members = guild.members.cache.size >= guild.memberCount
            ? guild.members.cache
            : await guild.members.fetch({ time: 20000 });
        const ids = [...members.filter((m) => !m.user.bot).keys()];
        for (let i = 0; i < ids.length; i += 1000) {
            await FunEconomy.updateMany(
                { userId: { $in: ids.slice(i, i + 1000) }, guildIds: { $ne: guild.id } },
                { $addToSet: { guildIds: guild.id } }
            );
        }
        backfilled.set(guild.id, { ok: true, at: Date.now() });
    } catch (error) {
        console.error('[FUNECONOMY] Guild backfill failed:', error.message);
    }
}

// ---------------------------------------------------------------------------
// Query ranking. Setiap kategori punya `top` (daftar) dan `rankOf` (posisi seorang user).
// Format baris top: { id, value, ...ekstra }.  Format rankOf: { rank, value, ...ekstra } atau null.
// ---------------------------------------------------------------------------
const scopeFilter = (scope, guildId) => (scope === 'guild' ? { guildIds: guildId } : {});

const money = {
    async top({ scope, guildId, limit }) {
        const rows = await FunEconomy.find({ cash: { $gt: 0 }, ...scopeFilter(scope, guildId) })
            .sort({ cash: -1, _id: 1 }).limit(limit).select('userId cash').lean();
        return rows.map((r) => ({ id: r.userId, value: r.cash }));
    },
    async rankOf(userId, { scope, guildId }) {
        const me = await FunEconomy.findOne({ userId }).select('cash').lean();
        const cash = me?.cash ?? 0;
        if (cash <= 0) return null;
        const ahead = await FunEconomy.countDocuments({ cash: { $gt: cash }, ...scopeFilter(scope, guildId) });
        return { rank: ahead + 1, value: cash };
    }
};

// Streak daily hanya dihitung kalau masih aktif (klaim terakhir hari ini atau kemarin).
const activeStreak = (today) => ({ dailyStreak: { $gt: 0 }, lastDailyDay: { $gte: today - 1 } });

const daily = {
    async top({ scope, guildId, limit, today }) {
        const rows = await FunEconomy.find({ ...activeStreak(today), ...scopeFilter(scope, guildId) })
            .sort({ dailyStreak: -1, _id: 1 }).limit(limit).select('userId dailyStreak').lean();
        return rows.map((r) => ({ id: r.userId, value: r.dailyStreak }));
    },
    async rankOf(userId, { scope, guildId, today }) {
        const me = await FunEconomy.findOne({ userId, ...activeStreak(today) }).select('dailyStreak').lean();
        if (!me) return null;
        const ahead = await FunEconomy.countDocuments({
            ...activeStreak(today),
            dailyStreak: { $gt: me.dailyStreak },
            ...scopeFilter(scope, guildId)
        });
        return { rank: ahead + 1, value: me.dailyStreak };
    }
};

// Level Fun Economy dari XP chat dan daily, dengan filter server seperti ranking cash.
const level = {
    async top({ scope, guildId, limit }) {
        const rows = await FunEconomy.find({ xp: { $gt: 0 }, ...scopeFilter(scope, guildId) })
            .sort({ xp: -1, _id: 1 }).limit(limit).select('userId xp level').lean();
        return rows.map((r) => ({ id: r.userId, value: r.xp, level: r.level ?? levelFromXp(r.xp) }));
    },
    async rankOf(userId, { scope, guildId }) {
        const me = await FunEconomy.findOne({ userId, ...scopeFilter(scope, guildId) }).select('xp level').lean();
        const xp = me?.xp ?? 0;
        if (xp <= 0) return null;
        const ahead = await FunEconomy.countDocuments({ xp: { $gt: xp }, ...scopeFilter(scope, guildId) });
        return { rank: ahead + 1, value: xp, level: me.level ?? levelFromXp(xp) };
    }
};

// Ranking server berdasarkan total cash member yang tercatat (seperti "owo top guild").
const guildPipeline = [
    { $match: { cash: { $gt: 0 }, guildIds: { $exists: true, $ne: [] } } },
    { $unwind: '$guildIds' },
    { $group: { _id: '$guildIds', total: { $sum: '$cash' }, members: { $sum: 1 } } },
    { $sort: { total: -1, _id: 1 } }
];

const guild = {
    async top({ limit }) {
        const rows = await FunEconomy.aggregate([...guildPipeline, { $limit: limit }]);
        return rows.map((r) => ({ id: r._id, value: r.total, members: r.members }));
    },
    async rankOf(_userId, { guildId }) {
        const rows = await FunEconomy.aggregate(guildPipeline);
        const index = rows.findIndex((r) => r._id === guildId);
        if (index === -1) return null;
        return { rank: index + 1, value: rows[index].total, members: rows[index].members };
    }
};

const CATEGORIES = { money, daily, level, guild };

module.exports = { touchGuild, backfillGuild, CATEGORIES };