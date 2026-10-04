const crypto = require('crypto');
const cfg = require('./config');

const MAX_LEVEL = 10000;

/** XP yang dibutuhkan untuk naik dari level ke level + 1 (level mulai dari 1). */
function xpNeeded(level) {
    const { BASE, LINEAR, QUADRATIC } = cfg.LEVELING.FORMULA;
    return QUADRATIC * level * level + LINEAR * level + BASE;
}

/** Total XP untuk mencapai level (level 1 = 0 XP). */
function totalXpForLevel(level) {
    const steps = Math.min(level, MAX_LEVEL) - 1;
    if (steps <= 0) return 0;
    const { BASE, LINEAR, QUADRATIC } = cfg.LEVELING.FORMULA;
    const sumSquares = (steps * (steps + 1) * (2 * steps + 1)) / 6;
    const sum = (steps * (steps + 1)) / 2;
    return QUADRATIC * sumSquares + LINEAR * sum + BASE * steps;
}

function levelFromXp(xp) {
    if (!(xp > 0)) return 1;
    let low = 1;
    let high = MAX_LEVEL;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (totalXpForLevel(mid) <= xp) low = mid;
        else high = mid - 1;
    }
    return low;
}

function progress(xp) {
    const level = levelFromXp(xp);
    const base = totalXpForLevel(level);
    return { level, into: xp - base, needed: totalXpForLevel(level + 1) - base };
}

function rewardForLevels(from, to) {
    if (to <= from) return 0;
    return cfg.LEVELING.REWARD_PER_LEVEL * ((to * (to + 1)) / 2 - (from * (from + 1)) / 2);
}

const rollChatXp = () => crypto.randomInt(cfg.LEVELING.CHAT_XP_MIN, cfg.LEVELING.CHAT_XP_MAX + 1);

function planGain(state, { source, day, roll = rollChatXp }) {
    const T = cfg.LEVELING;
    if (source === 'daily') {
        return { gain: T.DAILY_COMMAND_XP, chatGain: 0, bonus: 0, setDay: false, newToday: state.xpToday };
    }

    const newDay = state.xpDay !== day;
    const today = newDay ? 0 : state.xpToday;
    const chatGain = Math.min(Math.max(0, T.DAILY_CHAT_XP_CAP - today), roll());
    const bonus = newDay ? T.FIRST_MESSAGE_BONUS : 0;
    return { gain: chatGain + bonus, chatGain, bonus, setDay: true, newToday: today + chatGain };
}

module.exports = { MAX_LEVEL, xpNeeded, totalXpForLevel, levelFromXp, progress, rewardForLevels, planGain };