const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const { fmt, displayName, send } = require('../utils');

module.exports = {
    name: 'cash',
    aliases: ['bal', 'balance', 'money', 'credit', 'currency'],
    async execute(message) {
        const balance = await Economy.getCash(message.author.id);
        // Format sama seperti OwO: pesan satu baris, tanpa embed
        return send(
            message,
            `${cfg.CASH_EMOJI} | **${displayName(message)}**, you currently have **__${fmt(balance)}__ ${cfg.CASH_NAME}!**`
        );
    }
};
