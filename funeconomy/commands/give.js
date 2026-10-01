const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const { fmt, displayName, send, errorLine, isAmountToken, parseAmount } = require('../utils');
const { escapeMarkdown } = require('discord.js');

module.exports = {
    name: 'give',
    aliases: ['send'],
    async execute(message, args, client) {
        const senderId = message.author.id;
        const name = displayName(message);
        const usage = errorLine(name, `wrong arguments! Usage: \`${cfg.PREFIX}give @user <amount|all>\``);

        // Cari target (mention atau ID) dan jumlah di argumen mana pun
        let target = message.mentions.users.first() || null;
        let amountToken = null;
        for (const token of args) {
            if (/^<@!?\d+>$/.test(token)) continue;
            if (!target && /^\d{17,20}$/.test(token)) {
                target = await client.users.fetch(token).catch(() => null);
                if (!target) return send(message, errorLine(name, 'I could not find that user!'));
            } else if (amountToken === null && isAmountToken(token)) {
                amountToken = token;
            } else {
                return send(message, usage);
            }
        }
        if (!target || amountToken === null) return send(message, usage);

        if (target.bot) return send(message, errorLine(name, "you can't give bots any " + cfg.CASH_NAME + '!'));
        if (target.id === senderId) return send(message, errorLine(name, `you can't give ${cfg.CASH_NAME} to yourself!`));

        const balance = await Economy.getCash(senderId);
        const amount = parseAmount(amountToken, balance);
        if (!Number.isSafeInteger(amount) || amount < 1) {
            return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));
        }

        // Kurangi atomik dulu; kalau gagal menambah ke penerima, kembalikan ke pengirim
        const debited = await Economy.deduct(senderId, amount);
        if (!debited) return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));

        try {
            await Economy.add(target.id, amount);
        } catch (error) {
            await Economy.add(senderId, amount).catch((refundError) =>
                console.error('[FUNECONOMY] Could not refund failed give:', refundError));
            throw error;
        }

        const targetName = escapeMarkdown(message.guild.members.cache.get(target.id)?.displayName ?? target.username);
        return send(message, `${cfg.EMOJI.GIVE} | **${name}** sent ${cfg.CASH_EMOJI} **${fmt(amount)}** to **${targetName}**!`);
    }
};
