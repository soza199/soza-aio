const fs = require('fs');
const path = require('path');
const { PermissionsBitField } = require('discord.js');
const cfg = require('./config');
const { touchGuild } = require('../models/funeconomy/ranking');
const { ensureRegistered } = require('./register');

// Muat semua command di funeconomy/commands (nama + alias)
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    for (const key of [command.name, ...(command.aliases || [])]) {
        commands.set(key.toLowerCase(), command);
    }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "<prefix><command>" lalu (opsional) spasi + argumen. Contoh: scash, scf 100 h, ss all
const MATCHER = new RegExp(`^${escapeRegex(cfg.PREFIX)}([a-z]+)(?:\\s+([\\s\\S]*))?$`, 'i');

/** Return true kalau pesan adalah command fun economy (dan sudah ditangani). */
async function handleFunEconomy(message, client) {
    if (message.author.bot || !message.guild || !message.content) return false;

    const match = MATCHER.exec(message.content.trim());
    if (!match) return false;

    const command = commands.get(match[1].toLowerCase());
    if (!command) return false;

    // Jangan proses (dan jangan potong saldo) kalau bot tidak bisa membalas di channel ini
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const permissions = me && message.channel.permissionsFor?.(me);
    if (!permissions?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
        return false;
    }

    const args = (match[2] || '').trim().split(/\s+/).filter(Boolean);

    // Command yang sengaja diabaikan (mis. "ss" tanpa angka = "screenshot") tidak menampilkan Register.
    if (command.ignore?.(args)) return false;

    // Semua command economy membutuhkan akun aktif.
    if (!(await ensureRegistered(message, client))) return true;

    // Catat server user (untuk ranking per-server). Kegagalan di sini tidak boleh menghentikan command.
    await touchGuild(message.author.id, message.guild.id)
        .catch((error) => console.error('[FUNECONOMY] touchGuild failed:', error.message));

    await command.execute(message, args, client);
    return true;
}

module.exports = { handleFunEconomy, commands };
