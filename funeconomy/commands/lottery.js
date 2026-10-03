const { EmbedBuilder } = require('discord.js');
const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const lottery = require('../lottery');
const cooldown = require('../cooldown');
const {
    fmt, displayName, send, sendEmbed, canEmbed, parseAmount, isAmountToken, errorLine,
    formatDuration, acquireGambleLock, releaseGambleLock, onCooldown
} = require('../utils');

const MAX = cfg.LOTTERY.MAX_PER_LOTTERY;

function chanceText(mine, pool) {
    if (!pool || !mine) return '0%';
    const pct = (mine / pool) * 100;
    if (pct < 0.01) return '<0.01%';
    return `${Number(pct.toFixed(2))}%`;
}

function embedFor(name, status, justBet) {
    const lines = [
        `**Total Bet:** ${cfg.CASH_EMOJI} ${fmt(status.mine)}`,
        justBet ? `**Just Bet:** ${cfg.CASH_EMOJI} ${fmt(justBet)}` : null,
        `**Winning Chance:** ${chanceText(status.mine, status.pool)}`,
        `**Ends In:** ${formatDuration(lottery.msUntilReset())}`,
        `**Current Jackpot:** ${cfg.CASH_EMOJI} ${fmt(status.pool)}`,
        `**Participants:** ${fmt(status.players)}`
    ].filter(Boolean);

    return new EmbedBuilder()
        .setTitle(`${name}'s Lottery Submission`)
        .setColor(0x3498db)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Max ${fmt(MAX)} per lottery` });
}

module.exports = {
    name: 'lottery',
    aliases: ['bet', 'lotto'],
    async execute(message, args, client) {
        const userId = message.author.id;
        const name = displayName(message);

        if (!canEmbed(message)) {
            return send(message, errorLine(name, 'I need the **Embed Links** permission in this channel to show the lottery!'));
        }
        if (args.length > 1 || (args[0] && !isAmountToken(args[0]))) {
            return send(message, errorLine(name, `wrong arguments! Usage: \`${cfg.PREFIX}lottery [amount|all]\``));
        }
        if (onCooldown(message, 'lottery')) return;
        if (!acquireGambleLock(userId)) return;

        try {
            await lottery.settleDue(client).catch((e) => console.error('[FUNECONOMY] Lottery settle failed:', e));

            const day = lottery.dayNumber();
            const status = await lottery.getStatus(day, userId);
            const plainName = message.member?.displayName ?? message.author.username;

            // Tanpa jumlah = hanya lihat status lottery
            if (!args[0]) {
                cooldown.start('lottery', userId);
                return sendEmbed(message, embedFor(plainName, status, 0));
            }

            const remaining = MAX - status.mine;
            if (remaining <= 0) {
                return send(message, errorLine(name, `you can only bet up to **${fmt(MAX)}** per lottery!`));
            }

            const balance = await Economy.getCash(userId);
            const bet = parseAmount(args[0], balance, remaining);
            if (!Number.isSafeInteger(bet) || bet < cfg.MIN_BET) {
                if (args[0].toLowerCase() === 'all') return send(message, errorLine(name, `you don't have any ${cfg.CASH_NAME} to bet!`));
                return send(message, errorLine(name, `you need to bet at least **${fmt(cfg.MIN_BET)}**!`));
            }
            if (bet > remaining) {
                return send(message, errorLine(name, status.mine === 0
                    ? `the maximum amount you can bet per lottery is **${fmt(MAX)}**!`
                    : `you can only bet up to **${fmt(MAX)}** per lottery! You can still bet **${fmt(remaining)}**.`));
            }
            if (balance < bet) return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));

            const debited = await Economy.deduct(userId, bet);
            if (!debited) return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));

            let entry;
            try {
                entry = await lottery.addEntry(day, userId, bet);
            } catch (error) {
                await Economy.add(userId, bet).catch((e) => console.error('[FUNECONOMY] Lottery refund failed:', e));
                throw error;
            }
            if (!entry) {
                // Batas per lottery terlewati (balapan antar command): kembalikan taruhan
                await Economy.add(userId, bet);
                return send(message, errorLine(name, `you can only bet up to **${fmt(MAX)}** per lottery!`));
            }

            cooldown.start('lottery', userId);
            const updated = await lottery.getStatus(day, userId);
            return sendEmbed(message, embedFor(plainName, updated, bet));
        } finally {
            releaseGambleLock(userId);
        }
    }
};