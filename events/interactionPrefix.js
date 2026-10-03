const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { fetchGif } = require('../utils/fetchMedia');

// Prefix text for all /gif-interactions actions, e.g.:
//   soza hug @user | soza pat <reply to a message> | soza hug (no target = self)
const PREFIXES = ['soza'];
const SLASH_COMMAND_NAME = 'gif-interactions';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHER = new RegExp(`^(?:${PREFIXES.map(escapeRegex).join('|')})\\s+([a-z]+)(?:\\s+([\\s\\S]*))?$`, 'i');

function verbFor(action) {
    if (action === 'handhold') return 'holds hands with';
    if (action === 'highfive') return 'high fives';
    if (action === 'kiss') return 'kisses';
    if (action.endsWith('h')) return `${action}es`;
    return `${action}s`;
}

async function resolveTarget(message, args) {
    // 1) mention  2) ID  3) reply to another user's message
    const mentioned = message.mentions.users.first();
    if (mentioned) return mentioned;

    const idArg = args.find((arg) => /^\d{17,20}$/.test(arg));
    if (idArg) {
        const user = await message.client.users.fetch(idArg).catch(() => null);
        if (user) return user;
    }

    if (message.reference?.messageId) {
        const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (replied?.author) return replied.author;
    }
    return null;
}

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot || !message.guild || !message.content) return;

        const content = message.content.trim();
        // Skip messages that cannot be this command before doing database work.
        if (content.length > 200) return;
        const match = MATCHER.exec(content);
        if (!match) return;

        const action = match[1].toLowerCase();
        const { interactions } = require('../commands/media/gifs2');
        if (!Object.prototype.hasOwnProperty.call(interactions, action)) return;

        const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
        const perms = me && message.channel.permissionsFor?.(me);
        if (!perms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return;
        if (!perms.has(PermissionsBitField.Flags.EmbedLinks)) {
            return message.reply('❌ I need the **Embed Links** permission for this command.').catch(() => {});
        }

        // Respect /manage-commands for the whole command or this subcommand.
        try {
            const DisabledCommand = require('../models/commands/DisabledCommands');
            const disabled = await DisabledCommand.find({
                guildId: message.guild.id,
                commandName: SLASH_COMMAND_NAME,
                $or: [
                    { subcommandName: null },
                    { subcommandName: { $exists: false } },
                    { subcommandName: action },
                ],
            }).limit(1).lean();
            if (disabled.length) {
                return message.reply({
                    content: `❌ This command (${SLASH_COMMAND_NAME} ${action}) is disabled in this server.`,
                    allowedMentions: { repliedUser: false },
                }).catch(() => {});
            }
        } catch (error) {
            console.error('[INTERACTION-PREFIX] Disabled-command lookup failed; continuing:', error.message);
        }

        const args = (match[2] || '').trim().split(/\s+/).filter(Boolean);
        const sender = message.author;
        const target = await resolveTarget(message, args);

        try {
            await message.channel.sendTyping().catch(() => {});
            const gif = await fetchGif(interactions[action].func, action);

            const description = !target || target.id === sender.id
                ? `${sender} ${verbFor(action)} themselves!`
                : `${sender} ${verbFor(action)} ${target}!`;

            const embed = new EmbedBuilder()
                .setColor('#82DCFF')
                .setDescription(description)
                .setImage(gif)
                .setTimestamp();

            await message.reply({
                embeds: [embed],
                allowedMentions: { repliedUser: false, users: target ? [target.id] : [] },
            });
        } catch (error) {
            console.error('[INTERACTION-PREFIX] Error:', error);
            message.reply({
                content: 'Something went wrong while performing the interaction.',
                allowedMentions: { repliedUser: false },
            }).catch(() => {});
        }
    },
};