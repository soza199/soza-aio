const crypto = require('crypto');
const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const cooldown = require('../cooldown');
const {
    fmt, displayName, sleep, animateSlotReels, isAmountToken, parseAmount, send, errorLine,
    acquireGambleLock, releaseGambleLock, onCooldown
} = require('../utils');

/**
 * Odds slots mengikuti OwO: peluang hasil ditentukan langsung (bukan dari peluang tiap reel).
 *   <:banana:1555452508229337169>  x1   (20%)   -> taruhan kembali
 *   <:raspberry:1555452597970935818>  x2   (20%)
 *   <:cherry:1555452550847930398>  x3   (5%)
 *   cash x3 (emoji cash)  x4   (2.5%)
 *   <:jackpot:1555452896039014411>  x10  (1%)
 *   lainnya kalah (51.5%).  RTP = 95% (rata-rata -0.05x per taruhan).
 * `chance` dalam per sejuta supaya aman dari galat desimal.
 */
const E = cfg.SLOT_EMOJI;
const SYMBOLS = {
    banana: { id: 'banana', emoji: E.banana },
    raspberry:    { id: 'raspberry',    emoji: E.raspberry },
    cherry:   { id: 'cherry',   emoji: E.cherry },
    cash:     { id: 'cash',     emoji: E.cash },
    jackpot:        { id: 'jackpot',        emoji: E.jackpot }
};
const ALL_SYMBOLS = Object.values(SYMBOLS);

const PAYOUTS = [
    { reels: ['banana', 'banana', 'banana'], multiplier: 1,  chance: 200000 },
    { reels: ['raspberry', 'raspberry', 'raspberry'],          multiplier: 2,  chance: 200000 },
    { reels: ['cherry', 'cherry', 'cherry'],       multiplier: 3,  chance: 50000 },
    { reels: ['cash', 'cash', 'cash'],             multiplier: 4,  chance: 25000 },
    { reels: ['jackpot', 'jackpot', 'jackpot'],                      multiplier: 10, chance: 10000 }
];
const CHANCE_SCALE = 1000000;

/** Pengali untuk tiga reel (0 = kalah). */
function multiplierFor(reels) {
    const ids = reels.map((s) => s.id).join(',');
    const hit = PAYOUTS.find((p) => p.reels.join(',') === ids);
    return hit ? hit.multiplier : 0;
}

function spinReels() {
    let roll = crypto.randomInt(CHANCE_SCALE);
    for (const payout of PAYOUTS) {
        if (roll < payout.chance) return payout.reels.map((id) => SYMBOLS[id]);
        roll -= payout.chance;
    }
    // Kalah: acak tiga simbol, ulangi kalau kebetulan membentuk kombinasi menang.
    let reels;
    do {
        reels = [0, 1, 2].map(() => ALL_SYMBOLS[crypto.randomInt(ALL_SYMBOLS.length)]);
    } while (multiplierFor(reels) > 0);
    return reels;
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
    _internals: { SYMBOLS, PAYOUTS, spinReels, multiplierFor },
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

            if (onCooldown(message, 'slots')) return;

            const reels = spinReels();
            const multiplier = multiplierFor(reels);
            const payout = bet * multiplier;

            const settled = await Economy.settleBet(userId, bet, payout);
            if (!settled) {
                return send(message, errorLine(name, `you don't have enough ${cfg.CASH_NAME}!`));
            }

            cooldown.start('slots', userId);

            const outcome = payout > 0
                ? `and won ${cfg.CASH_EMOJI} ${fmt(payout)}`
                : 'and won nothing... :c';
            let sent;
            await animateSlotReels(reels, async (symbols, isFinal) => {
                const content = renderSlots(name, bet, symbols, isFinal ? outcome : '');
                if (!sent) {
                    sent = await send(message, content);
                    return;
                }

                const edit = sent.edit({ content, allowedMentions: { parse: [] } });
                if (isFinal) {
                    await edit.catch(() => send(message, content).catch(() => {}));
                } else {
                    await edit.catch(() => {});
                }
            });
        } finally {
            releaseGambleLock(userId);
        }
    }
};
