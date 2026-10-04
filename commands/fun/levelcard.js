const { SlashCommandBuilder } = require('discord.js');
const LevelCardPreference = require('../../models/funeconomy/levelCardPreference');
const {
    MAX_UPLOAD_BYTES,
    SUPPORTED_MIME_TYPES,
    normalizeCardBackground
} = require('../../funeconomy/cardBackgroundUpload');

const MIME_BY_EXTENSION = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
};

function getAttachmentMimeType(attachment) {
    const declaredType = attachment.contentType?.split(';')[0].trim().toLowerCase();
    if (declaredType) return declaredType;
    const extension = attachment.name?.split('.').pop()?.toLowerCase();
    return MIME_BY_EXTENSION[extension] || '';
}

async function readAttachment(response) {
    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        totalBytes += bytes.length;
        if (totalBytes > MAX_UPLOAD_BYTES) {
            throw new Error(`Ukuran gambar maksimal ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
        }
        chunks.push(bytes);
    }

    return Buffer.concat(chunks, totalBytes);
}

async function uploadBackground(interaction) {
    const attachment = interaction.options.getAttachment('image');
    if (!attachment) {
        return interaction.reply({
            content: 'Pilih gambar dari galeri perangkat melalui kolom lampiran `image`.',
            ephemeral: true
        });
    }

    if (attachment.size > MAX_UPLOAD_BYTES) {
        return interaction.reply({
            content: `Ukuran gambar maksimal ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
            ephemeral: true
        });
    }

    const mimeType = getAttachmentMimeType(attachment);
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
        return interaction.reply({
            content: 'Gunakan gambar PNG, JPG, atau WebP.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const response = await fetch(attachment.url);
        if (!response.ok || !response.body) {
            throw new Error('Lampiran Discord tidak dapat diunduh.');
        }

        const uploadedImage = await readAttachment(response);
        const normalizedImage = await normalizeCardBackground(uploadedImage, mimeType);
        await LevelCardPreference.setBackgroundBuffer(interaction.user.id, normalizedImage);

        return interaction.editReply(
            '✅ Gambar dari galeri Anda sudah disimpan. Jalankan `slevel` untuk melihat kartu level.'
        );
    } catch (error) {
        if (error.code === 'INVALID_CARD_BACKGROUND') {
            return interaction.editReply(`❌ ${error.message}`);
        }

        console.error('[LEVEL CARD] Could not save uploaded background:', error);
        return interaction.editReply('❌ Gambar gagal disimpan. Coba unggah PNG, JPG, atau WebP lain.');
    }
}

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('levelcard')
        .setDescription('Atur gambar latar kartu level Anda')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('upload')
                .setDescription('Pilih dan unggah gambar dari galeri perangkat')
                .addAttachmentOption((option) =>
                    option
                        .setName('image')
                        .setDescription('Gambar PNG, JPG, atau WebP dari galeri Anda')
                        .setRequired(true)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('reset')
                .setDescription('Kembalikan kartu ke gambar bawaan')),

    async execute(interaction) {
        if (!interaction?.options?.getSubcommand) {
            return interaction?.reply?.('Gunakan `/levelcard upload` atau `/levelcard reset`.');
        }
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Gunakan command ini di server Discord.',
                ephemeral: true
            });
        }

        if (interaction.options.getSubcommand() === 'reset') {
            await LevelCardPreference.resetBackground(interaction.user.id);
            return interaction.reply({
                content: '✅ Gambar latar kartu dikembalikan ke bawaan.',
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        }

        return uploadBackground(interaction);
    }
};
