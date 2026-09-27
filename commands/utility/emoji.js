const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const CUSTOM_EMOJI_PATTERN = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{15,25})>/;
const IMAGE_URL_PATTERN = /\.(?:png|jpe?g|gif|webp)(?:$|\?)/i;
const COLLECTOR_TIME = 5 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emoji')
        .setDescription('Preview a custom emoji and add it to this server')
        .addStringOption(option =>
            option
                .setName('target')
                .setDescription('Custom emoji such as <:name:id>')
                .setRequired(false)),

    async execute(context, argsOrClient = [], clientOrUndefined) {
        const isInteraction = typeof context.isChatInputCommand === 'function'
            && context.isChatInputCommand();
        const message = isInteraction ? null : context;
        const args = isInteraction ? [] : argsOrClient;
        const interaction = isInteraction ? context : null;
        const guild = context.guild;

        if (!guild) {
            return this.reply(context, '❌ Perintah ini hanya bisa digunakan di dalam server Discord.');
        }

        const input = isInteraction
            ? interaction.options.getString('target') || ''
            : args.join(' ').trim();
        const sourceMessage = message ? await this.getReferencedMessage(message) : null;
        const source = this.resolveSource({
            input,
            message,
            sourceMessage
        });

        if (!source) {
            return this.reply(context, {
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ed4245')
                        .setTitle('❌ Emoji tidak ditemukan')
                        .setDescription([
                            'Kirim custom emoji setelah command, reply pesan yang berisi emoji, atau lampirkan file gambar.',
                            '',
                            '**Contoh:**',
                            '`.emoji <:discord:1290171240761397311>`',
                            '`.emoji` lalu reply pesan emoji',
                            '`.emoji` dengan attachment PNG/GIF/WebP'
                        ].join('\n'))
                ]
            });
        }

        const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
        const canManageEmojis = Boolean(
            botMember?.permissions.has('ManageEmojisAndStickers')
        );
        const response = await this.reply(context, {
            embeds: [this.buildEmbed(source, canManageEmojis ? null : 'no_permission')],
            components: [this.buildButtons(source, canManageEmojis, `${source.id}_${context.id}`)]
        });

        if (!response || !canManageEmojis) return response;

        const stealButtonId = `emoji_steal_${source.id}_${context.id}`;
        let stolenEmoji = null;
        const collector = response.createMessageComponentCollector({
            time: COLLECTOR_TIME,
            filter: buttonInteraction => buttonInteraction.customId === stealButtonId
        });

        collector.on('collect', async buttonInteraction => {
            if (stolenEmoji) {
                await buttonInteraction.reply({
                    content: 'ℹ️ Emoji ini sudah ditambahkan ke server.',
                    ephemeral: true
                }).catch(() => {});
                return;
            }

            const latestBotMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
            if (!latestBotMember?.permissions.has('ManageEmojisAndStickers')) {
                await buttonInteraction.reply({
                    content: '❌ Bot tidak memiliki izin **Manage Emojis and Stickers**.',
                    ephemeral: true
                }).catch(() => {});
                return;
            }

            try {
                stolenEmoji = await guild.emojis.create({
                    attachment: source.url,
                    name: source.name,
                    reason: `Emoji stolen by ${buttonInteraction.user.tag}`
                });

                const mention = `<${stolenEmoji.animated ? 'a' : ''}:${stolenEmoji.name}:${stolenEmoji.id}>`;
                await buttonInteraction.update({
                    embeds: [this.buildEmbed(source, 'stolen', stolenEmoji)],
                    components: [this.buildButtons(source, false, `${source.id}_${context.id}`, true)]
                });
                await buttonInteraction.followUp({
                    content: `✅ ${mention} berhasil ditambahkan ke server oleh ${buttonInteraction.user}.`,
                    allowedMentions: { users: [buttonInteraction.user.id] }
                }).catch(() => {});
                collector.stop('stolen');
            } catch (error) {
                console.error('Emoji steal error:', error);
                await buttonInteraction.reply({
                    content: this.getCreateErrorMessage(error),
                    ephemeral: true
                }).catch(() => {});
            }
        });

        collector.on('end', async () => {
            if (stolenEmoji) return;
            await response.edit({
                components: [this.buildButtons(source, false, `${source.id}_${context.id}`, false)]
            }).catch(() => {});
        });

        return response;
    },

    async reply(context, payload) {
        if (typeof context.isChatInputCommand === 'function' && context.isChatInputCommand()) {
            await context.reply(payload);
            return context.fetchReply();
        }

        return context.channel.send(payload);
    },

    async getReferencedMessage(message) {
        if (!message.reference?.messageId) return null;

        return message.channel.messages
            .fetch(message.reference.messageId)
            .catch(() => null);
    },

    resolveSource({ input, message, sourceMessage }) {
        const textSources = [input, sourceMessage?.content].filter(Boolean);
        for (const text of textSources) {
            const match = text.match(CUSTOM_EMOJI_PATTERN);
            if (match) {
                const animated = match[1] === 'a';
                return {
                    name: match[2],
                    id: match[3],
                    animated,
                    url: `https://cdn.discordapp.com/emojis/${match[3]}.${animated ? 'gif' : 'png'}?size=512&quality=lossless`,
                    sourceType: 'Discord custom emoji'
                };
            }
        }

        const attachments = [
            ...(message?.attachments?.values() || []),
            ...(sourceMessage?.attachments?.values() || [])
        ];
        const attachment = attachments.find(item =>
            item.contentType?.startsWith('image/') || IMAGE_URL_PATTERN.test(item.url)
        );

        if (!attachment) return null;

        const nameFromFile = (attachment.name || 'emoji')
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 32);

        return {
            name: nameFromFile.length >= 2 ? nameFromFile : 'emoji',
            id: attachment.id || 'attachment',
            animated: /\.gif(?:$|\?)/i.test(attachment.url),
            url: attachment.url,
            sourceType: 'Image attachment'
        };
    },

    buildEmbed(source, status, stolenEmoji) {
        const embed = new EmbedBuilder()
            .setColor(status === 'stolen' ? '#57f287' : '#5865f2')
            .setTitle(`${source.animated ? '✨' : '🖼️'} ${source.name}`)
            .setDescription('Preview custom emoji')
            .addFields(
                { name: 'Name', value: `\`${source.name}\``, inline: true },
                { name: 'ID', value: `\`${source.id}\``, inline: true },
                { name: 'Type', value: source.animated ? 'Animated' : 'Static', inline: true }
            )
            .setImage(source.url)
            .setURL(source.url)
            .setFooter({ text: `Source: ${source.sourceType}` });

        if (status === 'no_permission') {
            embed.addFields({
                name: '⚠️ Steal unavailable',
                value: 'Bot membutuhkan izin **Manage Emojis and Stickers** untuk menambahkan emoji ke server.'
            });
        }

        if (status === 'stolen' && stolenEmoji) {
            embed.addFields({
                name: '✅ Status',
                value: `Berhasil ditambahkan sebagai <${stolenEmoji.animated ? 'a' : ''}:${stolenEmoji.name}:${stolenEmoji.id}>`
            });
        }

        return embed;
    },

    buildButtons(source, canManageEmojis, suffix, stolen = false) {
        const stealButtonId = `emoji_steal_${suffix}`;

        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Open image')
                .setStyle(ButtonStyle.Link)
                .setURL(source.url),
            new ButtonBuilder()
                .setCustomId(stealButtonId)
                .setLabel(stolen ? 'Emoji added' : 'Steal emoji')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!canManageEmojis || stolen)
        );
    },

    getCreateErrorMessage(error) {
        if (error.code === 30008 || /maximum number of emojis/i.test(error.message)) {
            return '❌ Server sudah mencapai batas maksimum emoji.';
        }
        if (error.code === 50013 || /Missing Permissions/i.test(error.message)) {
            return '❌ Bot tidak memiliki izin untuk menambahkan emoji.';
        }
        if (/invalid form body|invalid asset/i.test(error.message)) {
            return '❌ File emoji tidak valid atau ukurannya terlalu besar.';
        }
        return '❌ Emoji gagal ditambahkan. Pastikan bot memiliki izin dan file masih bisa diakses.';
    }
};