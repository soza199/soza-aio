const cfg = require('../../funeconomy/config');
const FunEconomy = require('./schema');
const Meta = require('./meta');
const { ensureAccount } = require('./economy');

const DUPLICATE_KEY = 11000;
const MIGRATION_KEY = 'registration-migrated';
const COUNTER_KEY = 'account-counter';
const CACHE_LIMIT = 100000;

const registeredCache = new Set();
let migration = null;

const remember = (userId) => {
    if (registeredCache.size >= CACHE_LIMIT) registeredCache.clear();
    registeredCache.add(userId);
};

async function upsertMeta(key, update, options) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await Meta.findOneAndUpdate({ key }, update, { upsert: true, ...options }).lean();
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
        }
    }
}

async function runMigration() {
    if (await Meta.exists({ key: MIGRATION_KEY })) return;

    await FunEconomy.updateMany(
        {
            registeredAt: null,
            $or: [{ cash: { $gt: 0 } }, { dailyStreak: { $gt: 0 } }, { lastDailyDay: { $gte: 0 } }]
        },
        { $set: { registeredAt: new Date() } }
    );

    const total = await FunEconomy.countDocuments({ registeredAt: { $ne: null } });
    await upsertMeta(COUNTER_KEY, { $setOnInsert: { value: total } }, { new: false });
    await upsertMeta(MIGRATION_KEY, { $setOnInsert: { value: Date.now() } }, { new: false });
}

function ensureMigrated() {
    if (!cfg.REGISTRATION.ENABLED || !cfg.REGISTRATION.GRANDFATHER_EXISTING) return Promise.resolve();
    if (!migration) {
        migration = runMigration().catch((error) => {
            migration = null;
            throw error;
        });
    }
    return migration;
}

async function isRegistered(userId) {
    if (!cfg.REGISTRATION.ENABLED || registeredCache.has(userId)) return true;
    await ensureMigrated();
    const doc = await FunEconomy.findOne({ userId }).select('registeredAt').lean();
    if (!doc?.registeredAt) return false;
    remember(userId);
    return true;
}

async function register(userId, guildId = null) {
    await ensureMigrated();
    await ensureAccount(userId);

    const bonus = cfg.REGISTRATION.BONUS;
    const update = { $set: { registeredAt: new Date() }, $inc: { cash: bonus } };
    if (guildId) update.$addToSet = { guildIds: guildId };

    const doc = await FunEconomy.findOneAndUpdate({ userId, registeredAt: null }, update, { new: true }).lean();
    remember(userId);
    if (!doc) return { created: false };

    let accountNumber = null;
    try {
        const counter = await upsertMeta(COUNTER_KEY, { $inc: { value: 1 } }, { new: true });
        accountNumber = counter.value;
        await FunEconomy.updateOne({ userId }, { $set: { accountNumber } });
    } catch (error) {
        console.error('[FUNECONOMY] Could not assign account number:', error.message);
    }

    return { created: true, cash: doc.cash, bonus, accountNumber };
}

module.exports = {
    isRegistered,
    register,
    ensureMigrated,
    _internals: { registeredCache, resetMigration: () => { migration = null; } }
};