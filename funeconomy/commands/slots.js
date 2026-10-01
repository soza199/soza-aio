const crypto = require('crypto');
const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const {
    fmt, displayName, sleep, isAmountToken, parseAmount, send, errorLine,
    acquireGambleLock, releaseGambleLock
} = require('../utils');

/**
 * Tabel slot. `weight` = peluang relatif muncul per reel, `triple` = pengali bila 3 sama.
 * Dua 🍒 (tepat dua) = x2. Selain itu kalah.
 * RTP (return to player) teoritis ~ 93.5%, peluang menang ~ 24.5%.
 */
const SYMBOLS = [
    { id: 'cherry',   emoji: '🍒',           weight: 30, triple: 5 },
    { id: 'eggplant', emoji: '🍆',           weight: 26, triple: 8 },
    { id: 'heart',    emoji: '❤️',           weight: 20, triple: 12 },
    { id: 'o',        emoji: '⭕',           weight: 14, triple: 30 },
    { id: 'cash',     emoji: cfg.CASH_EMOJI, weight: 10, triple: 100 }
];
const PAIR_CHERRY_MULTIPLIER = 2;
const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function pickSymbol() {
    let roll = crypto.randomInt(TOTAL_WEIGHT);
    for (const symbol of SYMBOLS) {
        if (roll < symbol.weight) return symbol;
        roll -= symbol.weight;
    }
    return SYMBOLS[SYMBOLS.length - 1];
}

function spinReels() {
    return [pickSymbol(), pickSymbol(), pickSymbol()];
}

function multiplierFor(reels) {
    const [a, b, c] = reels;
    if (a.id === b.id && b.id === c.id) return a.triple;
    if (reels.filter((s) => s.id === 'cherry').length === 2) return PAIR_CHERRY_MULTIPLIER;
    return 0;
}

const BOX = '\u00A0\u00A0'; // kotak kode kosong di kiri/kanan baris reel
const renderSlots = (name, bet, emojis, outcome) =>
    [
        '**`___SLOTS___`**',
        `\`${BOX}\` ${emojis.join(' ')} \`${BOX}\` **${name}** bet ${cfg.CASH_EMOJI} ${fmt(bet)}`,
        `\`|         |\` ${outcome}`,
        '`|         |`'
    ].join('\n');

module.exports = {
    name: 's',
    aliases: ['slots', 'slot'],
    // diekspor untuk pengujian
    _internals: { SYMBOLS, PAIR_CHERRY_MULTIPLIER, spinReels, multiplierFor },
    async execute(message, args) {
        const userId = message.author.id;
        const name = displayName(message);

        // "ss" tanpa angka sering berarti "screenshot" di chat -> abaikan diam-diam
        if (cfg.SLOTS_REQUIRE_AMOUNT) {
            if (args.length === 0 || !isAmountToken(args[0])) return;
        } else if (args.length > 0 && !isAmountToken(args[0])) {
            return;
        }

        if (!acquireGambleLock(userId)) return;
        try {
            const balance = await Economy.getCash(userId);
            const bet = args.length === 0 ? cfg.MIN_BET : parseAmount(args[0], balance, cfg.MAX_BET);

            if (bet < cfg.MIN_BET) {
                if (args[0]?.toLowerCase() === 'all') return send(message, errorLine(name, `you don't have any ${cfg.CASH_NAME} to bet!`));
                return send(message, errorLine(name, `you need to bet at least **${fmt(cfg.MIN_BET)}**!`));
            }
            if (bet > cfg.MAX_BET) {
                return send(message, errorLine(name, `the maximum amount you can bet is **${fmt(cfg.MAX_BET)}**!`));
            }
            if (balance < bet) {
                return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));
            }

            const reels = spinReels();
            const multiplier = multiplierFor(reels);
            const payout = bet * multiplier;

            const settled = await Economy.settleBet(userId, bet, payout);
            if (!settled) {
                return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));
            }

            const spinning = Array(3).fill(cfg.SLOT_SPINNING);
            const sent = await send(message, renderSlots(name, bet, spinning, ''));
            await sleep(cfg.ANIMATION_MS);

            const outcome = payout > 0
                ? `and won ${cfg.CASH_EMOJI} ${fmt(payout)}`
                : 'and won nothing... :c';
            const finalText = renderSlots(name, bet, reels.map((s) => s.emoji), outcome);

            await sent.edit({ content: finalText, allowedMentions: { parse: [] } })
                .catch(() => send(message, finalText).catch(() => {}));
        } finally {
            releaseGambleLock(userId);
        }
    }
};
