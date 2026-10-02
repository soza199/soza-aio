const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const Drop = require('../../models/funeconomy/drop');
const { fmt, displayName, send, errorLine, acquireGambleLock, releaseGambleLock } = require('../utils');

module.exports = {
    name: 'pickup',
    aliases: [],
    async execute(message) {
        const userId = message.author.id;
        const name = displayName(message);
        if (!acquireGambleLock(userId)) return;

        try {
            const drops = await Drop.find({ channelId: message.channel.id }).limit(200).lean();

            // Ambil satu per satu secara atomik: dua orang yang mengetik bersamaan tidak bisa mengambil drop yang sama.
            const claimed = [];
            for (const drop of drops) {
                const taken = await Drop.findOneAndDelete({ _id: drop._id }).lean();
                if (taken) claimed.push(taken);
            }
            const total = claimed.reduce((sum, d) => sum + d.amount, 0);
            if (total === 0) return send(message, errorLine(name, `there is no ${cfg.CASH_NAME} to pick up here!`));

            try {
                await Economy.add(userId, total);
            } catch (error) {
                // Gagal menambah saldo: kembalikan drop supaya tidak hilang
                await Drop.insertMany(claimed.map(({ channelId, userId: from, amount }) => ({ channelId, userId: from, amount })))
                    .catch((e) => console.error('[FUNECONOMY] Could not restore drops:', e));
                throw error;
            }

            return send(message, `${cfg.EMOJI.PICKUP} | **${name}** picked up ${cfg.CASH_EMOJI} **${fmt(total)}** ${cfg.CASH_NAME}!`);
        } finally {
            releaseGambleLock(userId);
        }
    }
};