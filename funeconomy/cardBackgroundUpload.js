const { createCanvas, loadImage } = require('@napi-rs/canvas');

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 12_000_000;
const CARD_WIDTH = 1000;
const CARD_HEIGHT = 330;
const SUPPORTED_MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

function invalidImage(message) {
    const error = new Error(message);
    error.code = 'INVALID_CARD_BACKGROUND';
    return error;
}

function readPngDimensions(buffer) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
        throw invalidImage('File PNG tidak valid.');
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        throw invalidImage('File JPG tidak valid.');
    }

    const startOfFrameMarkers = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
    ]);
    let offset = 2;
    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        while (buffer[offset] === 0xff) offset += 1;
        const marker = buffer[offset];
        offset += 1;

        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > buffer.length) break;

        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
        if (startOfFrameMarkers.has(marker)) {
            if (segmentLength < 7) break;
            return {
                height: buffer.readUInt16BE(offset + 3),
                width: buffer.readUInt16BE(offset + 5)
            };
        }
        offset += segmentLength;
    }
    throw invalidImage('Ukuran gambar JPG tidak bisa dibaca.');
}

function readWebpDimensions(buffer) {
    if (
        buffer.length < 30
        || buffer.toString('ascii', 0, 4) !== 'RIFF'
        || buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) {
        throw invalidImage('File WebP tidak valid.');
    }

    const chunk = buffer.toString('ascii', 12, 16);
    const readUInt24LE = (offset) =>
        buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

    if (chunk === 'VP8X') {
        return { width: readUInt24LE(24) + 1, height: readUInt24LE(27) + 1 };
    }
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
        const b1 = buffer[21];
        const b2 = buffer[22];
        const b3 = buffer[23];
        const b4 = buffer[24];
        return {
            width: 1 + b1 + ((b2 & 0x3f) << 8),
            height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)
        };
    }
    if (
        chunk === 'VP8 '
        && buffer[23] === 0x9d
        && buffer[24] === 0x01
        && buffer[25] === 0x2a
    ) {
        return {
            width: buffer.readUInt16LE(26) & 0x3fff,
            height: buffer.readUInt16LE(28) & 0x3fff
        };
    }
    throw invalidImage('Format WebP ini tidak didukung.');
}

function getDimensions(buffer, mimeType) {
    if (mimeType === 'image/png') return readPngDimensions(buffer);
    if (mimeType === 'image/jpeg') return readJpegDimensions(buffer);
    if (mimeType === 'image/webp') return readWebpDimensions(buffer);
    throw invalidImage('Gunakan gambar PNG, JPG, atau WebP.');
}

async function normalizeCardBackground(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw invalidImage('File gambar kosong atau tidak valid.');
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
        throw invalidImage('Ukuran gambar maksimal 5 MB.');
    }
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
        throw invalidImage('Gunakan gambar PNG, JPG, atau WebP.');
    }

    const dimensions = getDimensions(buffer, mimeType);
    const { width, height } = dimensions;
    if (
        !width || !height
        || width > MAX_DIMENSION
        || height > MAX_DIMENSION
        || width * height > MAX_PIXELS
    ) {
        throw invalidImage('Resolusi gambar terlalu besar. Maksimal 12 megapiksel.');
    }

    let image;
    try {
        image = await loadImage(buffer);
    } catch {
        throw invalidImage('File gambar tidak dapat dibuka.');
    }
    if (image.width !== width || image.height !== height) {
        throw invalidImage('Data ukuran gambar tidak cocok.');
    }

    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101022';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const scale = Math.max(CARD_WIDTH / image.width, CARD_HEIGHT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(image, (CARD_WIDTH - drawWidth) / 2, (CARD_HEIGHT - drawHeight) / 2, drawWidth, drawHeight);

    const normalized = canvas.toBuffer('image/png');
    if (normalized.length > MAX_STORED_BYTES) {
        throw invalidImage('Hasil gambar terlalu besar untuk disimpan. Coba gambar lain.');
    }
    return normalized;
}

module.exports = {
    MAX_UPLOAD_BYTES,
    SUPPORTED_MIME_TYPES,
    normalizeCardBackground
};