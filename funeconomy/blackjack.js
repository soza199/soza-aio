const crypto = require('crypto');
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const cfg = require('./config');
const Economy = require('../models/funeconomy/economy');
const Blackjack = require('../models/funeconomy/blackjack');
const { fmt } = require('./utils');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const BUTTON_PREFIX = 'fbj';

const COLORS = { playing: 0x3498db, win: 0x2ecc71, lose: 0xe74c3c, push: 0x95a5a6 };

// ---------------------------------------------------------------------------
// Aturan permainan
// ---------------------------------------------------------------------------
const cardLabel = (n) => `${RANKS[n % 13]}${SUITS[Math.floor(n / 13)]}`;

function newDeck() {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/** Nilai tangan terbaik (As = 11 selama tidak bust, selain itu 1). */
function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
        const rank = card % 13;
        if (rank === 0) { aces++; total += 11; }
        else total += Math.min(rank + 1, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

const isNatural = (cards) => cards.length === 2 && handValue(cards) === 21;

/** Dealer menarik kartu sampai minimal 17 (berhenti di semua 17, termasuk soft 17). */
function playDealer(game) {
    while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());
}

/** Hasil akhir dari sudut pandang pemain: 'win' | 'lose' | 'push'. */
function outcomeOf(game) {
    const player = handValue(game.player);
    const dealer = handValue(game.dealer);
    if (player > 21) return 'lose';
    if (dealer > 21) return 'win';
    if (player > dealer) return 'win';
    if (player < dealer) return 'lose';
    return 'push';
}

function payoutFor(outcome, bet) {
    if (outcome === 'win') return Math.floor(bet * cfg.BLACKJACK.WIN_MULTIPLIER);
    if (outcome === 'push') return bet;
    return 0;
}

// ---------------------------------------------------------------------------
// Tampilan
// ---------------------------------------------------------------------------
const hand = (cards) => cards.map((c) => `\`${cardLabel(c)}\``).join(' ');

function buttons(userId, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}:hit:${userId}`)
            .setLabel('Hit')
            .setEmoji(cfg.BLACKJACK.HIT_EMOJI)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}:stand:${userId}`)
            .setLabel('Stand')
            .setEmoji(cfg.BLACKJACK.STAND_EMOJI)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    )];
}

/**
 * Embed game. `result` = undefined saat game masih berjalan (kartu kedua dealer disembunyikan),
 * atau { outcome, payout, natural, bust } saat selesai.
 */
function render(game, { name, botName, result }) {
    const finished = !!result;
    const dealerCards = finished
        ? hand(game.dealer)
        : `${hand(game.dealer.slice(0, 1))} \`??\``;
    const dealerValue = finished ? handValue(game.dealer) : handValue(game.dealer.slice(0, 1));

    const embed = new EmbedBuilder()
        .setTitle(`${name} bet ${fmt(game.bet)} ${cfg.CASH_NAME}`)
        .setColor(COLORS[finished ? result.outcome : 'playing'])
        .addFields(
            { name: `${name} [${handValue(game.player)}]`, value: hand(game.player), inline: true },
            { name: `${botName} [${dealerValue}]`, value: dealerCards, inline: true }
        );

    if (!finished) {
        embed.setFooter({ text: `${cfg.BLACKJACK.HIT_EMOJI} Hit  ·  ${cfg.BLACKJACK.STAND_EMOJI} Stand` });
    } else if (result.outcome === 'win') {
        const lead = result.natural ? 'Blackjack! ' : result.dealerBust ? 'Dealer busted! ' : '';
        embed.setDescription(`${lead}You won ${cfg.CASH_EMOJI} **${fmt(result.payout)}**!`);
    } else if (result.outcome === 'push') {
        embed.setDescription(`It's a tie! Your ${cfg.CASH_EMOJI} **${fmt(game.bet)}** was returned.`);
    } else {
        const lead = result.bust ? 'You busted! ' : '';
        embed.setDescription(`${lead}You lost ${cfg.CASH_EMOJI} **${fmt(game.bet)}**... :c`);
    }
    return embed;
}

// ---------------------------------------------------------------------------
// Penyelesaian game
// ---------------------------------------------------------------------------
/** Kredit saldo dengan beberapa kali percobaan ulang, aman dipanggil ulang untuk game yang sama. */
async function creditWithRetry(userId, gameId, amount) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await Economy.addBlackjackPayout(userId, gameId, amount);
            return;
        } catch (error) {
            if (attempt === 3) {
                console.error(`[FUNECONOMY] Blackjack payout FAILED for ${userId}, amount ${amount}:`, error);
                throw error;
            }
        }
    }
}

/**
 * Simpan hasil terlebih dahulu, bayar secara idempoten, lalu hapus game.
 * Jika proses mati di tengah penyelesaian, command berikutnya dapat melanjutkan tanpa menggandakan payout.
 */
async function finish(userId, game, outcome) {
    let finalized = await Blackjack.findOne({ userId }).lean();
    if (!finalized) return null;

    if (!finalized.outcome) {
        const payout = payoutFor(outcome, finalized.bet);
        finalized = await Blackjack.findOneAndUpdate(
            { userId, outcome: null },
            {
                $set: {
                    outcome,
                    payout,
                    natural: outcome === 'win' && isNatural(game.player),
                    bust: handValue(game.player) > 21,
                    dealerBust: handValue(game.dealer) > 21,
                    deck: game.deck,
                    player: game.player,
                    dealer: game.dealer
                }
            },
            { new: true }
        ).lean() || await Blackjack.findOne({ userId }).lean();
    }
    if (!finalized) return null;

    if (finalized.payout > 0) {
        await creditWithRetry(userId, finalized._id, finalized.payout);
    }

    const claimed = await Blackjack.findOneAndDelete({
        userId,
        _id: finalized._id,
        outcome: finalized.outcome
    }).lean();
    if (!claimed) return null;
    return {
        outcome: claimed.outcome,
        payout: claimed.payout,
        natural: claimed.natural,
        bust: claimed.bust,
        dealerBust: claimed.dealerBust
    };
}

/** Matikan tombol di pesan lama (dipakai saat game dilanjutkan di pesan baru). Gagal = abaikan. */
async function retireOldMessage(client, game) {
    if (!game.channelId || !game.messageId) return;
    try {
        const channel = await client.channels.fetch(game.channelId);
        const old = await channel?.messages?.fetch(game.messageId);
        await old?.edit({ components: [] });
    } catch { /* pesan sudah hilang */ }
}

// ---------------------------------------------------------------------------
// Handler tombol (dipanggil dari events/funEconomyInteraction.js)
// ---------------------------------------------------------------------------
const busy = new Set();

async function handleButton(interaction, client) {
    const [, action, ownerId] = interaction.customId.split(':');
    if (!['hit', 'stand'].includes(action) || !ownerId) return;

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "This isn't your game!", flags: MessageFlags.Ephemeral });
    }
    if (busy.has(ownerId)) return interaction.deferUpdate().catch(() => {});
    busy.add(ownerId);

    try {
        const game = await Blackjack.findOne({ userId: ownerId }).lean();
        if (!game) {
            return interaction.update({ components: [] });
        }
        if (game.messageId && game.messageId !== interaction.message.id) {
            return interaction.reply({
                content: `This game continues in a newer message. Type \`${cfg.PREFIX}bj\` to resume it.`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferUpdate();

        const name = interaction.member?.displayName ?? interaction.user.username;
        const botName = client.user.username;

        if (game.outcome) {
            const result = await finish(ownerId, game, game.outcome);
            if (!result) return interaction.editReply({ components: [] });
            return interaction.editReply({
                embeds: [render(game, { name, botName, result })],
                components: []
            });
        }

        if (action === 'hit') {
            game.player.push(game.deck.pop());
            const value = handValue(game.player);

            if (value < 21) {
                await Blackjack.updateOne({ userId: ownerId }, { $set: { deck: game.deck, player: game.player } });
                return interaction.editReply({
                    embeds: [render(game, { name, botName })],
                    components: buttons(ownerId)
                });
            }
            // Bust = langsung kalah. Tepat 21 = otomatis stand.
            if (value > 21) {
                const result = await finish(ownerId, game, 'lose');
                if (!result) return interaction.editReply({ components: [] });
                return interaction.editReply({ embeds: [render(game, { name, botName, result })], components: [] });
            }
        }

        playDealer(game);
        const result = await finish(ownerId, game, outcomeOf(game));
        if (!result) return interaction.editReply({ components: [] });
        return interaction.editReply({ embeds: [render(game, { name, botName, result })], components: [] });
    } catch (error) {
        console.error('[FUNECONOMY] Blackjack button error:', error);
        if (!interaction.deferred && !interaction.replied) {
            interaction.reply({ content: 'Something went wrong, please try again.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    } finally {
        busy.delete(ownerId);
    }
}

module.exports = {
    BUTTON_PREFIX, newDeck, handValue, isNatural, playDealer, outcomeOf, payoutFor,
    cardLabel, render, buttons, finish, retireOldMessage, handleButton
};