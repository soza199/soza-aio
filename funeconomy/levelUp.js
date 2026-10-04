const cfg = require('./config');
const Level = require('../models/funeconomy/level');
const LevelCardPreference = require('../models/funeconomy/levelCardPreference');
const Registration = require('../models/funeconomy/registration');
const { AttachmentBuilder, PermissionsBitField } = require('discord.js');
const { fmt, displayName } = require('./utils');

let mainPrefix = null;
try { mainPrefix = require('../config.json').prefix || null; } catch { /* config.json optional */ }

/** Teks level up (dipakai sebagai pesan utama dan fallback bila kartu tidak bisa dikirim). */
function levelUpText(name, result, { withRewards = true } = {}) {
    const head = `${cfg.EMOJI.LEVELUP} | **${name}** leveled up!`;
    if (!withRewards) return head;
    return `${head}\n${cfg.CASH_EMOJI} | **${fmt(result.reward)}** ${cfg.CASH_NAME}`;
}

function canAttach(channel) {
    const me = channel.guild?.members?.me;
    if (!me) return false;
    const permissions = channel.permissionsFor?.(me);
    return !!permissions?.has([PermissionsBitField.Flags.AttachFiles]);
}

async function buildCard({ channel, name, userId, avatarURL, result }) {
    if (!cfg.LEVELING.LEVELUP_CARD || !canAttach(channel)) return null;
    try {
        const { generateLevelUpCard } = require('./levelUpCard');
        const backgroundBuffer = userId
            ? await LevelCardPreference.getBackgroundBuffer(userId)
            : null;
        const buffer = await generateLevelUpCard({
            name, avatarURL, level: result.levelAfter, reward: result.reward, backgroundBuffer
        });
        return new AttachmentBuilder(buffer, { name: 'levelup.png' });
    } catch (error) {
        console.error('[FUNECONOMY] Level up card failed:', error.message);
        return null;
    }
}

async function announceLevelUp({ channel, name, userId, guildId, result, avatarURL = null }) {
    if (!result || result.levelAfter <= result.levelBefore) return false;
    if (guildId && !(await Level.isAnnounceEnabled(guildId))) return false;

    // Format OwO: "🎉 | nama leveled up!" + kartu gambar berisi level dan hadiah.
    const card = await buildCard({ channel, name, userId, avatarURL, result });
    if (card) {
        await channel.send({
            content: levelUpText(name, result, { withRewards: false }),
            files: [card],
            allowedMentions: { parse: [] }
        });
        return true;
    }
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

async function rewardDaily({ userId, channel, name, guildId, avatarURL = null }) {
    const result = await grantDailyXp(userId);
    if (!result) return;
    await announceLevelUp({ channel, name, userId, guildId, result, avatarURL })
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
        userId: message.author.id,
        guildId: message.guild.id,
        result,
        avatarURL: message.author.displayAvatarURL?.({ extension: 'png', size: 256 }) ?? null
    });
}

module.exports = {
    levelUpText, announceLevelUp, grantDailyXp, rewardDaily, handleChat,
    _internals: { chatState }
};