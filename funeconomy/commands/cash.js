const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const cooldown = require('../cooldown');
const { fmt, displayName, send, onCooldown } = require('../utils');

module.exports = {
    name: 'cash',
    aliases: ['bal', 'balance', 'money', 'credit', 'currency'],
    async execute(message) {
        const userId = message.author.id;
        if (onCooldown(message, 'cash')) return;

        const balance = await Economy.getCash(userId);
        cooldown.start('cash', userId);
        // Format sama seperti OwO: pesan satu baris, tanpa embed
        return send(
            message,
            `${cfg.CASH_EMOJI} | **${displayName(message)}**, you currently have **__${fmt(balance)}__ ${cfg.CASH_NAME}!**`
        );
    }
};
