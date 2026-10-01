const { escapeMarkdown } = require('discord.js');
const cfg = require('./config');

const fmt = (n) => Number(n).toLocaleString('en-US');

const displayName = (message) =>
    escapeMarkdown(message.member?.displayName ?? message.author.username);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NUMBER_PATTERN = /^(\d{1,3}(,\d{3})+|\d+)$/;

/** Token berupa "all" atau angka (boleh "1,000")? */
function isAmountToken(token) {
    const t = String(token).toLowerCase();
    return t === 'all' || NUMBER_PATTERN.test(t);
}

/**
 * Ubah token jadi jumlah. "all" = saldo (dibatasi `cap` kalau ada).
 * Return null kalau bukan angka.
 */
function parseAmount(token, balance, cap = Infinity) {
    const t = String(token).toLowerCase();
    if (t === 'all') return Math.min(balance, cap);
    if (!NUMBER_PATTERN.test(t)) return null;
    return Number(t.replace(/,/g, ''));
}

/** 45123000 -> "12H 32M 3S" (format timer ala OwO) */
function formatDuration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}H ${m}M ${s}S`;
}

/** Kirim pesan biasa (bukan reply, seperti OwO) tanpa memicu mention. */
const send = (message, content) =>
    message.channel.send({ content, allowedMentions: { parse: [] } });

const errorLine = (name, text) => `${cfg.EMOJI.ERROR} | **${name}**, ${text}`;

// Satu taruhan per user pada satu waktu (mencegah spam saat animasi berjalan).
const gambleLocks = new Set();
const acquireGambleLock = (userId) => {
    if (gambleLocks.has(userId)) return false;
    gambleLocks.add(userId);
    return true;
};
const releaseGambleLock = (userId) => gambleLocks.delete(userId);

module.exports = {
    fmt, displayName, sleep, isAmountToken, parseAmount, formatDuration,
    send, errorLine, acquireGambleLock, releaseGambleLock
};
