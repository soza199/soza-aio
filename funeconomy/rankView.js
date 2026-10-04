const { escapeMarkdown } = require('discord.js');
const cfg = require('./config');
const { fmt } = require('./utils');
const { dayNumber } = require('./commands/daily')._internals;

/** Nama kategori yang diterima (alias -> kategori). "g" dipakai untuk global, jadi tidak ada di sini. */
const CATEGORY_ALIASES = {
    money: 'money', cash: 'money', cowoncy: 'money', c: 'money', m: 'money', balance: 'money',
    daily: 'daily', streak: 'daily', d: 'daily',
    level: 'level', lvl: 'level', lv: 'level', xp: 'level', l: 'level',
    guild: 'guild', guilds: 'guild', server: 'guild', servers: 'guild'
};

const LABELS = {
    money: cfg.CASH_NAME,
    daily: 'daily streak',
    level: 'level',
    guild: 'server'
};

/**
 * Baca argumen "[kategori] [global|g] [jumlah]" dalam urutan apa saja.
 * Return { category, scope, count } atau { error: true }.
 */
function parseArgs(args, { allowCount }) {
    let category = 'money';
    let scope = cfg.RANK.DEFAULT_SCOPE;
    let count = cfg.RANK.DEFAULT_COUNT;

    for (const raw of args) {
        const token = raw.toLowerCase();
        if (token === 'global' || token === 'g') scope = 'global';
        else if (CATEGORY_ALIASES[token]) category = CATEGORY_ALIASES[token];
        else if (allowCount && /^\d{1,3}$/.test(token)) count = Math.min(Math.max(Number(token), 1), cfg.RANK.MAX_COUNT);
        else return { error: true };
    }
    // Ranking server selalu membandingkan antar-server
    if (category === 'guild') scope = 'global';
    return { category, scope, count };
}

const queryOptions = (message, scope, extra = {}) => ({
    scope, guildId: message.guild.id, today: dayNumber(), ...extra
});

const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;

/** Teks nilai untuk satu baris ranking. */
function valueText(category, row, scope) {
    switch (category) {
        case 'money': return `${cfg.CASH_EMOJI} ${fmt(row.value)}`;
        case 'daily': return `${cfg.EMOJI.STREAK} ${plural(row.value, 'day')}`;
        case 'level':
            return row.level
                ? `${cfg.EMOJI.LEVEL} Lv ${fmt(row.level)} · ${fmt(row.value)} XP`
                : `${cfg.EMOJI.LEVEL} ${fmt(row.value)} XP`;
        case 'guild': return `${cfg.CASH_EMOJI} ${fmt(row.value)} (${plural(row.members, 'member')})`;
        default: return fmt(row.value);
    }
}

/** Judul dalam bentuk "Top 10 cash in Server" / "Top 10 global cash". */
function titleText(category, scope, count, guildName) {
    if (category === 'guild') return `Top ${count} servers by ${cfg.CASH_NAME}`;
    const where = scope === 'guild' ? `in ${escapeMarkdown(guildName)}` : 'globally';
    return `Top ${count} ${LABELS[category]} ${where}`;
}

/** Nama tampilan untuk baris ranking (user atau server). */
async function resolveName(message, client, category, scope, id) {
    if (category === 'guild') {
        return escapeMarkdown(client.guilds.cache.get(id)?.name ?? 'Unknown Server');
    }
    const cached = scope === 'guild' ? message.guild.members.cache.get(id)?.displayName : null;
    if (cached) return escapeMarkdown(cached);
    const user = await client.users.fetch(id).catch(() => null);
    return escapeMarkdown(user?.username ?? 'Unknown User');
}

module.exports = {
    CATEGORY_ALIASES, LABELS, parseArgs, queryOptions, valueText, titleText, resolveName, plural
};