const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const cooldown = require('../cooldown');
const { rewardDaily } = require('../levelUp');
const { fmt, displayName, send, errorLine, formatDuration, onCooldown } = require('../utils');

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = cfg.TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;

const dayNumber = (now = Date.now()) => Math.floor((now + OFFSET_MS) / DAY_MS);
const msUntilReset = (now = Date.now()) => (dayNumber(now) + 1) * DAY_MS - OFFSET_MS - now;

const amountForStreak = (streak) =>
    cfg.DAILY.BASE + cfg.DAILY.PER_STREAK * (Math.min(streak, cfg.DAILY.MAX_STREAK_BONUS_DAYS + 1) - 1);

module.exports = {
    name: 'daily',
    aliases: [],
    async execute(message) {
        const userId = message.author.id;
        if (onCooldown(message, 'daily')) return;

        const name = displayName(message);
        const now = Date.now();
        const result = await Economy.claimDaily(userId, dayNumber(now), amountForStreak);
        cooldown.start('daily', userId);

        if (!result.claimed) {
            return send(
                message,
                `${cfg.EMOJI.TIMER} | **${name}**, Nu! You need to wait **${formatDuration(msUntilReset(now))}** for your next daily!`
            );
        }

        const sent = await send(message, [
            `${cfg.EMOJI.DAILY} | **${name}**, Here is your daily **${cfg.CASH_EMOJI} ${fmt(result.amount)} ${cfg.CASH_NAME}**!`,
            `${cfg.EMOJI.DAILY} | You're on a **${fmt(result.streak)}** daily streak!`,
            `${cfg.EMOJI.TIMER} | Your next daily is in: ${formatDuration(msUntilReset(now))}`
        ].join('\n'));

        // Bonus XP dari daily; level up diumumkan terpisah setelah pesan daily.
        await rewardDaily({
            userId, channel: message.channel, name, guildId: message.guild?.id,
            avatarURL: message.author.displayAvatarURL?.({ extension: 'png', size: 256 }) ?? null
        });
        return sent;
    },
    _internals: { dayNumber, msUntilReset, amountForStreak }
};
