const cfg = require('../../funeconomy/config');
const FunEconomy = require('./schema');
const LevelGuild = require('./levelGuild');
const { levelFromXp, planGain, rewardForLevels } = require('../../funeconomy/leveling');

const DUPLICATE_KEY = 11000;
const MAX_ATTEMPTS = 8;
const ANNOUNCE_TTL_MS = 60 * 1000;
const dayOf = (now) => require('../../funeconomy/commands/daily')._internals.dayNumber(now);
const accountFilter = () => (cfg.REGISTRATION.ENABLED ? { registeredAt: { $ne: null } } : {});

async function grantXp(userId, { source, now = Date.now(), roll } = {}) {
    const day = dayOf(now);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const doc = await FunEconomy.findOne({ userId, ...accountFilter() }).select('xp level xpDay xpToday').lean();
        if (!doc) return null;

        const xp = doc.xp ?? 0;
        const levelBefore = doc.level ?? levelFromXp(xp);
        const plan = planGain({ xpDay: doc.xpDay ?? -1, xpToday: doc.xpToday ?? 0 }, { source, day, roll });
        if (plan.gain <= 0) {
            return { gain: 0, chatGain: 0, bonus: 0, capped: true, levelBefore, levelAfter: levelBefore, reward: 0, xp };
        }

        const newXp = xp + plan.gain;
        const levelAfter = Math.max(levelBefore, levelFromXp(newXp));
        const reward = rewardForLevels(levelBefore, levelAfter);
        const set = { level: levelAfter };
        if (plan.setDay) {
            set.xpDay = day;
            set.xpToday = plan.newToday;
        }
        const inc = { xp: plan.gain };
        if (reward > 0) inc.cash = reward;

        const updated = await FunEconomy.findOneAndUpdate(
            {
                userId, ...accountFilter(),
                xp: doc.xp ?? null, xpDay: doc.xpDay ?? null, xpToday: doc.xpToday ?? null
            },
            { $set: set, $inc: inc },
            { new: true }
        ).lean();

        if (updated) {
            return {
                gain: plan.gain, chatGain: plan.chatGain, bonus: plan.bonus, capped: false,
                levelBefore, levelAfter, reward, xp: updated.xp, cash: updated.cash
            };
        }
    }
    return null;
}

async function getProfile(userId, now = Date.now()) {
    const doc = await FunEconomy.findOne({ userId, ...accountFilter() })
        .select('xp level xpDay xpToday').lean();
    if (!doc) return null;
    const xp = doc.xp ?? 0;
    const sameDay = doc.xpDay === dayOf(now);
    return {
        xp,
        level: doc.level ?? levelFromXp(xp),
        chatXpToday: sameDay ? (doc.xpToday ?? 0) : 0,
        bonusClaimedToday: sameDay
    };
}

const announceCache = new Map();

async function isAnnounceEnabled(guildId) {
    const cached = announceCache.get(guildId);
    if (cached && Date.now() - cached.at < ANNOUNCE_TTL_MS) return cached.value;
    const doc = await LevelGuild.findOne({ guildId }).select('announce').lean();
    const value = doc?.announce !== false;
    announceCache.set(guildId, { value, at: Date.now() });
    return value;
}

async function setAnnounce(guildId, value) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await LevelGuild.updateOne({ guildId }, { $set: { announce: value } }, { upsert: true });
            break;
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
        }
    }
    announceCache.set(guildId, { value, at: Date.now() });
}

module.exports = {
    grantXp, getProfile, isAnnounceEnabled, setAnnounce,
    _internals: { announceCache }
};