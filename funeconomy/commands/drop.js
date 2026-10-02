const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const Drop = require('../../models/funeconomy/drop');
const { fmt, displayName, send, errorLine, isAmountToken, parseAmount, acquireGambleLock, releaseGambleLock } = require('../utils');

module.exports = {
    name: 'drop',
    aliases: [],
    async execute(message, args) {
        const userId = message.author.id;
        const name = displayName(message);

        if (args.length !== 1 || !isAmountToken(args[0])) {
            return send(message, errorLine(name, `wrong arguments! Usage: \`${cfg.PREFIX}drop <amount|all>\``));
        }
        if (!acquireGambleLock(userId)) return;

        try {
            const balance = await Economy.getCash(userId);
            const amount = parseAmount(args[0], balance);
            if (!Number.isSafeInteger(amount) || amount < 1) {
                return send(message, errorLine(name, `you don't have any ${cfg.CASH_NAME} to drop!`));
            }
            if (balance < amount) return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));

            const debited = await Economy.deduct(userId, amount);
            if (!debited) return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));

            try {
                await Drop.create({ channelId: message.channel.id, userId, amount });
            } catch (error) {
                await Economy.add(userId, amount).catch((e) => console.error('[FUNECONOMY] Drop refund failed:', e));
                throw error;
            }

            return send(message,
                `${cfg.EMOJI.DROP} | **${name}** dropped ${cfg.CASH_EMOJI} **${fmt(amount)}** ${cfg.CASH_NAME}! ` +
                `Type \`${cfg.PREFIX}pickup\` to grab it!`);
        } finally {
            releaseGambleLock(userId);
        }
    }
};