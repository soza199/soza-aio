const {
    ActionRowBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    PermissionsBitField,
    SlashCommandBuilder,
    StringSelectMenuBuilder
} = require('discord.js');
const Level = require('../../models/funeconomy/level');
const LevelCardPreference = require('../../models/funeconomy/levelCardPreference');
const { CATEGORIES } = require('../../models/funeconomy/ranking');
const { CARD_BACKGROUNDS, DEFAULT_BACKGROUND_ID, getCardBackground } = require('../../funeconomy/cardBackgrounds');
const { generateLevelCard } = require('../../funeconomy/levelCard');
const { progress } = require('../../funeconomy/leveling');

const COLLECTOR_MS = 120_000;

async function buildPreviewData(interaction) {
    const userId = interaction.user.id;
    const profile = await Level.getProfile(userId);
    const { level, into, needed } = progress(profile?.xp ?? 0);
    const ranking = await CATEGORIES.level.rankOf(userId, { scope: 'global' }).catch(() => null);

    return {
        name: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
        guildName: interaction.guild.name,
        avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
        level,
        rank: ranking?.rank ?? null,
        xp: into,
        needed
    };
}

async function showGallery(interaction) {
    const botMember = interaction.guild.members.me
        || await interaction.guild.members.fetchMe().catch(() => null);
    const permissions = botMember && interaction.channel?.permissionsFor?.(botMember);
    if (!permissions?.has(PermissionsBitField.Flags.AttachFiles)) {
        return interaction.reply({
            content: 'Bot memerlukan izin **Attach Files** untuk menampilkan galeri kartu.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
        const [previewData, currentBackgroundId] = await Promise.all([
            buildPreviewData(interaction),
            LevelCardPreference.getBackgroundId(interaction.user.id)
        ]);
        const previews = await Promise.all(CARD_BACKGROUNDS.map(async (background) => {
            const buffer = await generateLevelCard({ ...previewData, backgroundId: background.id });
            const fileName = `level-card-${background.id}.png`;
            return { background, buffer, fileName };
        }));

        const embeds = previews.map(({ background, fileName }) => new EmbedBuilder()
            .setColor(0x5b1a7a)
            .setTitle(background.label)
            .setImage(`attachment://${fileName}`));
        const files = previews.map(({ buffer, fileName }) => new AttachmentBuilder(buffer, { name: fileName }));
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`levelcard-gallery:${interaction.user.id}`)
            .setPlaceholder('Pilih gambar latar untuk kartu Anda')
            .addOptions(CARD_BACKGROUNDS.map((background) => ({
                label: background.label,
                value: background.id,
                default: background.id === currentBackgroundId
            })));
        const row = new ActionRowBuilder().addComponents(menu);

        const reply = await interaction.editReply({
            content: 'Pilih salah satu gambar di atas untuk kartu level `slevel` Anda.',
            embeds,
            files,
            components: [row],
            allowedMentions: { parse: [] }
        });
        const collector = reply.createMessageComponentCollector({
            time: COLLECTOR_MS,
            filter: (component) =>
                component.customId === `levelcard-gallery:${interaction.user.id}`
                && component.user.id === interaction.user.id
        });

        collector.on('collect', async (component) => {
            const background = getCardBackground(component.values[0]);
            if (!background) {
                await component.reply({ content: 'Pilihan gambar tidak tersedia.', ephemeral: true });
                return;
            }

            try {
                await LevelCardPreference.setBackgroundId(interaction.user.id, background.id);
                const preview = previews.find((item) => item.background.id === background.id);
                const selectedEmbed = new EmbedBuilder()
                    .setColor(0x5b1a7a)
                    .setTitle(`Gambar kartu diubah: ${background.label}`)
                    .setImage('attachment://level-card-preview.png');
                await component.update({
                    content: '✅ Gambar latar kartu Anda sudah disimpan.',
                    embeds: [selectedEmbed],
                    files: [new AttachmentBuilder(preview.buffer, { name: 'level-card-preview.png' })],
                    attachments: [],
                    components: [],
                    allowedMentions: { parse: [] }
                });
                collector.stop('saved');
            } catch (error) {
                console.error('[LEVEL CARD] Could not save background:', error);
                await component.update({
                    content: '❌ Gambar kartu gagal disimpan. Coba lagi nanti dengan `/levelcard gallery`.',
                    embeds: [],
                    attachments: [],
                    components: [],
                    allowedMentions: { parse: [] }
                }).catch(() => {});
                collector.stop('error');
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason !== 'time' || collected.size > 0) return;
            reply.edit({
                content: 'Galeri kedaluwarsa. Jalankan `/levelcard gallery` untuk memilih gambar lagi.',
                embeds: [],
                attachments: [],
                components: []
            }).catch(() => {});
        });
    } catch (error) {
        console.error('[LEVEL CARD] Could not show background gallery:', error);
        await interaction.editReply({
            content: '❌ Galeri kartu tidak dapat dimuat. Coba lagi nanti.',
            embeds: [],
            components: [],
            allowedMentions: { parse: [] }
        }).catch(() => {});
    }
}

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('levelcard')
        .setDescription('Pilih gambar latar kartu level PNG Anda')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('gallery')
                .setDescription('Lihat dan pilih gambar dari galeri kartu'))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('reset')
                .setDescription('Kembalikan kartu ke gambar bawaan')),

    async execute(interaction) {
        if (!interaction?.options?.getSubcommand) {
            return interaction?.reply?.('Gunakan slash command `/levelcard gallery` atau `/levelcard reset`.');
        }
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Gunakan command ini di server Discord.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'reset') {
            await LevelCardPreference.resetBackground(interaction.user.id);
            return interaction.reply({
                content: `✅ Gambar latar dikembalikan ke bawaan (${DEFAULT_BACKGROUND_ID}).`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        }

        return showGallery(interaction);
    }
};