const { PermissionsBitField } = require('discord.js');
const config = require('../config.json');
const { runHelp } = require('../utils/helpMenu');

// Prefix command ".help" (and the server prefix, if configured).
module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild || !message.content) return;

        const content = message.content.trim();
        // Ignore messages that cannot be help commands before querying the database.
        if (content.length > 100 || !/help/i.test(content)) return;

        const prefixes = new Set([config.prefix || '.']);
        try {
            const ServerConfig = require('../models/serverConfig/schema');
            const doc = await ServerConfig.findOne({ serverId: message.guild.id }).lean();
            if (doc?.prefix) prefixes.add(doc.prefix);
        } catch (_) { /* use default prefix */ }

        const lower = content.toLowerCase();
        let query = null;
        let matched = false;
        for (const prefix of prefixes) {
            const trigger = `${prefix.toLowerCase()}help`;
            if (!lower.startsWith(trigger)) continue;
            const rest = content.slice(trigger.length);
            if (rest && !/^\s/.test(rest)) continue;
            matched = true;
            query = rest.trim();
            break;
        }
        if (!matched) return;

        // Respect help being disabled through /manage-commands.
        try {
            const DisabledCommand = require('../models/commands/DisabledCommands');
            const disabled = await DisabledCommand.findOne({ guildId: message.guild.id, commandName: 'help' });
            if (disabled) return;
        } catch (_) { /* ignore */ }

        const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
        const perms = me && message.channel.permissionsFor?.(me);
        if (!perms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return;
        if (!perms.has(PermissionsBitField.Flags.EmbedLinks)) {
            return message.reply('❌ I need the **Embed Links** permission to show the help menu.').catch(() => {});
        }

        try {
            await runHelp({
                client,
                userId: message.author.id,
                guildId: message.guild.id,
                query,
                send: (payload) => message.reply({ ...payload, allowedMentions: { repliedUser: false } }),
            });
        } catch (error) {
            console.error('[HELP] Prefix help error:', error);
            message.reply('❌ Something went wrong while opening the help menu.').catch(() => {});
        }
    },
};