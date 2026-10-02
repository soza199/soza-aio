const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const Blackjack = require('../../models/funeconomy/blackjack');
const bj = require('../blackjack');
const cooldown = require('../cooldown');
const {
    displayName, send, sendEmbed, canEmbed, resolveBet, errorLine,
    acquireGambleLock, releaseGambleLock, onCooldown
} = require('../utils');

const DUPLICATE_KEY = 11000;

/** Kirim (atau kirim ulang) pesan game yang sedang berjalan dan catat pesannya. */
async function sendGame(message, game, client) {
    const name = displayName(message);
    const botName = client.user.username;
    const sent = await sendEmbed(message, bj.render(game, { name, botName }), bj.buttons(game.userId));
    await Blackjack.updateOne(
        { userId: game.userId },
        { $set: { channelId: message.channel.id, messageId: sent.id } }
    );
}

module.exports = {
    name: 'bj',
    aliases: ['blackjack'],
    async execute(message, args, client) {
        const userId = message.author.id;
        const name = displayName(message);

        if (!canEmbed(message)) {
            return send(message, errorLine(name, 'I need the **Embed Links** permission in this channel to play blackjack!'));
        }
        if (!acquireGambleLock(userId)) return;

        try {
            // Game belum selesai? Lanjutkan di pesan baru (seperti OwO: "retype the command to resume").
            const existing = await Blackjack.findOne({ userId }).lean();
            if (existing) {
                await bj.retireOldMessage(client, existing);
                if (existing.outcome) {
                    const result = await bj.finish(userId, existing, existing.outcome);
                    if (!result) return;
                    return sendEmbed(message, bj.render(existing, {
                        name,
                        botName: client.user.username,
                        result
                    }));
                }
                return sendGame(message, existing, client);
            }

            const balance = await Economy.getCash(userId);
            const { bet, error } = resolveBet(args[0], balance);
            if (error) return send(message, errorLine(name, error));

            if (onCooldown(message, 'bj')) return;

            const deck = bj.newDeck();
            const game = {
                userId, bet,
                player: [deck.pop(), deck.pop()],
                dealer: [deck.pop(), deck.pop()],
                deck
            };

            // Buat dokumen game dulu (unik per user), baru potong saldo.
            try {
                await Blackjack.create({ ...game, channelId: message.channel.id });
            } catch (error) {
                if (error?.code === DUPLICATE_KEY) return; // command lain baru saja membuat game
                throw error;
            }

            const debited = await Economy.deduct(userId, bet);
            if (!debited) {
                await Blackjack.deleteOne({ userId });
                return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));
            }

            cooldown.start('bj', userId);

            // Blackjack alami (As + 10) di tangan siapa pun mengakhiri game langsung.
            if (bj.isNatural(game.player) || bj.isNatural(game.dealer)) {
                const outcome = bj.isNatural(game.player) && bj.isNatural(game.dealer) ? 'push'
                    : bj.isNatural(game.player) ? 'win' : 'lose';
                const result = await bj.finish(userId, game, outcome);
                const embed = bj.render(game, { name, botName: client.user.username, result: result || undefined });
                return sendEmbed(message, embed);
            }

            return sendGame(message, game, client);
        } finally {
            releaseGambleLock(userId);
        }
    }
};