const cfg = require('./config');
const Level = require('../models/funeconomy/level');
const Registration = require('../models/funeconomy/registration');
const { fmt, displayName } = require('./utils');

let mainPrefix = null;
try { mainPrefix = require('../config.json').prefix || null; } catch { /* config.json optional */ }

function levelUpText(name, result) {
    const gained = result.levelAfter - result.levelBefore;
    const head = gained > 1
        ? `${cfg.EMOJI.LEVEL} | **${name}**, you leveled up from **${fmt(result.levelBefore)}** to **${fmt(result.levelAfter)}**!`
        : `${cfg.EMOJI.LEVEL} | **${name}**, you leveled up! You are now level **${fmt(result.levelAfter)}**!`;
    const reward = `${cfg.CASH_EMOJI} | You received **${fmt(result.reward)}** ${cfg.CASH_NAME} as a level reward!`;
    return `${head}\n${reward}`;
}

async function announceLevelUp({ channel, name, guildId, result }) {
    if (!result || result.levelAfter <= result.levelBefore) return false;
    if (guildId && !(await Level.isAnnounceEnabled(guildId))) return false;
    await channel.send({ content: levelUpText(name, result), allowedMentions: { parse: [] } });
    return true;
}

async function grantDailyXp(userId) {
    if (!cfg.LEVELING.ENABLED) return null;
    try {
        return await Level.grantXp(userId, { source: 'daily' });
    } catch (error) {
        console.error('[FUNECONOMY] Daily XP failed:', error.message);
        return null;
    }
}

async function rewardDaily({ userId, channel, name, guildId }) {
    const result = await grantDailyXp(userId);
    if (!result) return;
    await announceLevelUp({ channel, name, guildId, result })
        .catch((error) => console.error('[FUNECONOMY] Level up message failed:', error.message));
}

const chatState = new Map();
const PRUNE_AT = 20000;
const normalize = (content) => content.trim().toLowerCase().replace(/\s+/g, ' ');

function isBotCommand(content) {
    try {
        if (require('./index').matchCommand(content)) return true;
    } catch { /* ignore command matcher errors */ }
    return !!mainPrefix && content.startsWith(mainPrefix);
}

async function handleChat(message) {
    const T = cfg.LEVELING;
    if (!T.ENABLED || message.author.bot || !message.guild || !message.content) return;

    const content = message.content.trim();
    if (content.length < T.MIN_MESSAGE_LENGTH || isBotCommand(content)) return;

    const userId = message.author.id;
    const now = Date.now();
    const previous = chatState.get(userId);
    if (previous && now - previous.at < T.CHAT_COOLDOWN_MS) return;

    const normalized = normalize(content);
    chatState.set(userId, { at: now, content: normalized });
    if (chatState.size > PRUNE_AT) {
        for (const [id, state] of chatState) {
            if (now - state.at >= T.CHAT_COOLDOWN_MS) chatState.delete(id);
        }
    }
    if (previous && previous.content === normalized) return;

    if (!(await Registration.isRegistered(userId))) return;

    const result = await Level.grantXp(userId, { source: 'chat', now });
    if (!result) return;

    await announceLevelUp({
        channel: message.channel,
        name: displayName(message),
        guildId: message.guild.id,
        result
    });
}

module.exports = {
    levelUpText, announceLevelUp, grantDailyXp, rewardDaily, handleChat,
    _internals: { chatState }
};