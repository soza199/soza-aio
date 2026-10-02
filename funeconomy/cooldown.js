const cfg = require('./config');

// key `${game}:${userId}` -> waktu (ms epoch) cooldown berakhir.
const until = new Map();
// key -> true kalau pesan "slow down" sudah dikirim pada jendela cooldown ini (supaya bot tidak ikut spam).
const warned = new Set();

function prune(now) {
    if (until.size < 5000) return;
    for (const [key, end] of until) {
        if (end <= now) { until.delete(key); warned.delete(key); }
    }
}

/** Sisa cooldown dalam ms (0 = boleh jalan). */
function remaining(game, userId, now = Date.now()) {
    return Math.max(0, (until.get(`${game}:${userId}`) ?? 0) - now);
}

/** Mulai cooldown untuk game ini. Tidak berbuat apa-apa kalau COOLDOWNS[game] = 0 / tidak diatur. */
function start(game, userId, now = Date.now()) {
    const ms = cfg.COOLDOWNS?.[game] ?? 0;
    if (ms <= 0) return;
    prune(now);
    const key = `${game}:${userId}`;
    until.set(key, now + ms);
    warned.delete(key);
}

/**
 * Cek cooldown. Return null kalau boleh jalan, atau { ms, notify } kalau masih cooldown.
 * `notify` true hanya pada pemanggilan pertama di jendela cooldown (kirim pesan cukup sekali).
 */
function check(game, userId, now = Date.now()) {
    const ms = remaining(game, userId, now);
    if (ms <= 0) return null;
    const key = `${game}:${userId}`;
    const notify = !warned.has(key);
    warned.add(key);
    return { ms, notify };
}

/** 4200 -> "5s" (dibulatkan ke atas, minimal 1s) */
const seconds = (ms) => `${Math.max(1, Math.ceil(ms / 1000))}s`;

module.exports = { remaining, start, check, seconds };