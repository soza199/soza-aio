/**
 * Fun Economy (gaya OwO) - semua pengaturan ada di sini.
 *
 * Command dikirim TANPA titik/prefix bot, cukup ketik langsung di chat:
 *   scash | scf <jumlah|all> [h/t] | ss <jumlah|all> | sdaily | sgive @user <jumlah> | slb
 */
module.exports = {
    // Prefix semua command fun economy ("s" + nama command -> scash, scf, ss, ...)
    PREFIX: 's',

    // Nama & emoji mata uang. Boleh pakai emoji custom server, contoh: '<:cash:123456789012345678>'
    CASH_NAME: 'cash',
    CASH_EMOJI: '💵',

    // Batas taruhan (sama seperti OwO). "all" = min(saldo, MAX_BET)
    MIN_BET: 1,
    MAX_BET: 250000,

    // Lama animasi coin flip / slots sebelum hasil muncul (ms)
    ANIMATION_MS: 3000,

    // true  -> "ss" tanpa angka / "ss bukti transfer" DIABAIKAN (supaya orang yang
    //          mengetik "ss" artinya screenshot tidak ikut menjalankan slots).
    // false -> "ss" saja = taruhan 1 (persis OwO).
    SLOTS_REQUIRE_AMOUNT: true,

    // Daily: reset tiap pergantian hari di zona waktu di bawah (7 = WIB / Jakarta)
    TIMEZONE_OFFSET_HOURS: 7,
    DAILY: {
        BASE: 500,               // hadiah hari pertama
        PER_STREAK: 100,         // tambahan per hari streak berikutnya
        MAX_STREAK_BONUS_DAYS: 30 // bonus streak berhenti naik setelah hari ke-30
    },

    // Emoji coin flip
    COIN: {
        SPINNING: '🪙',
        HEADS: '👑',
        TAILS: '🦅'
    },

    // Emoji slot saat berputar
    SLOT_SPINNING: '🎰',

    // Emoji pesan
    EMOJI: {
        ERROR: '🚫',
        DAILY: '💰',
        TIMER: '⏱',
        GIVE: '💳',
        TOP: '🏆'
    }
};
