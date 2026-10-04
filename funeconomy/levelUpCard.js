const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { fmt } = require('./utils');

const FONT = 'SozaLevelFont';
let fontReady = false;
function ensureFont() {
    if (fontReady) return;
    fontReady = true;
    try {
        GlobalFonts.registerFromPath(path.join(__dirname, '../UI/fonts/AfacadFlux-Regular.ttf'), FONT);
    } catch { /* pakai font sistem */ }
}
const font = (size, weight = 'bold') => `${weight} ${size}px ${FONT}, 'Segoe UI', Arial, sans-serif`;

const W = 1000;
const H = 330;
const SCALE = 2;

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Latar synthwave: langit ungu, matahari bergaris, gunung neon. */
function drawBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a0536');
    sky.addColorStop(0.55, '#5b1a7a');
    sky.addColorStop(1, '#0d1b5e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // bintang
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 45; i += 1) {
        const x = (i * 197) % W;
        const y = (i * 53) % 120;
        ctx.fillRect(x, y, 1.5, 1.5);
    }

    // matahari
    const cx = W * 0.47;
    const cy = 150;
    const radius = 135;
    const sun = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
    sun.addColorStop(0, '#ff3d9a');
    sun.addColorStop(0.55, '#ff8a4c');
    sun.addColorStop(1, '#ffc65a');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // garis gelap horizontal
    ctx.fillStyle = 'rgba(26,5,54,0.65)';
    for (let i = 0; i < 9; i += 1) {
        const y = cy - 10 + i * 17;
        ctx.fillRect(cx - radius, y, radius * 2, 2 + i * 0.9);
    }
    ctx.restore();

    // gunung (siluet + garis neon)
    const mountain = [
        [0, 330], [0, 250], [90, 215], [190, 245], [300, 190], [380, 160], [470, 205],
        [560, 235], [650, 175], [760, 215], [860, 195], [1000, 240], [1000, 330]
    ];
    ctx.beginPath();
    mountain.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    const rock = ctx.createLinearGradient(0, 160, 0, H);
    rock.addColorStop(0, '#16134a');
    rock.addColorStop(1, '#2a1a8a');
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,190,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,60,180,0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i += 1) {
        const y = 262 + i * 14;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    // gelapkan agar teks terbaca
    ctx.fillStyle = 'rgba(8,4,28,0.28)';
    ctx.fillRect(0, 0, W, H);
}

async function drawAvatar(ctx, avatarURL, name) {
    const x = 26;
    const y = 26;
    const size = H - 52;
    ctx.save();
    roundRect(ctx, x, y, size, size, 6);
    ctx.clip();
    let drawn = false;
    if (avatarURL) {
        try {
            const img = await loadImage(avatarURL);
            ctx.drawImage(img, x, y, size, size);
            drawn = true;
        } catch { /* fallback di bawah */ }
    }
    if (!drawn) {
        ctx.fillStyle = '#2b2d6e';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#ffffff';
        ctx.font = font(120);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(name || '?').trim().charAt(0).toUpperCase() || '?', x + size / 2, y + size / 2);
    }
    ctx.restore();
    return x + size;
}

// Ikon cash digambar sendiri, tidak butuh file gambar.
function iconCash(ctx, x, y, s) {
    const g = ctx.createLinearGradient(x, y, x + s, y + s * 0.6);
    g.addColorStop(0, '#6fe3ff');
    g.addColorStop(1, '#2aa6d6');
    ctx.fillStyle = g;
    roundRect(ctx, x, y + s * 0.18, s, s * 0.64, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s * 0.17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x + s * 0.1, y + s * 0.3, s * 0.12, s * 0.06);
    ctx.fillRect(x + s * 0.78, y + s * 0.64, s * 0.12, s * 0.06);
}

/** Kecilkan font sampai teks muat dalam maxWidth. */
function fitFont(ctx, text, startSize, maxWidth) {
    let size = startSize;
    ctx.font = font(size);
    while (size > 24 && ctx.measureText(text).width > maxWidth) {
        size -= 4;
        ctx.font = font(size);
    }
    return size;
}

/**
 * Buat kartu level up (PNG Buffer).
 * @param {{ name?: string, avatarURL?: string|null, level: number, reward: number }} opts
 */
async function generateLevelUpCard({ name, avatarURL, level, reward }) {
    ensureFont();
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    ctx.save();
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.clip();
    drawBackground(ctx);

    const avatarRight = await drawAvatar(ctx, avatarURL, name);

    // panel kanan (hadiah)
    const dividerX = 690;
    const centerX = (avatarRight + dividerX) / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(44, 'normal');
    ctx.fillText('LEVEL UP!', centerX, 120);

    ctx.fillStyle = '#ffffff';
    const levelText = fmt(level);
    fitFont(ctx, levelText, 150, dividerX - avatarRight - 40);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(levelText, centerX, 255);
    ctx.shadowBlur = 0;

    // garis pemisah
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(dividerX, 36, 3, H - 72);

    // Satu baris hadiah (cash), diletakkan di tengah panel kanan.
    const cy = H / 2;
    const iconSize = 64;
    iconCash(ctx, dividerX + 30, cy - iconSize / 2, iconSize);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = font(52, 'normal');
    ctx.fillText(`+${fmt(reward)}`, W - 38, cy);

    ctx.restore();
    return canvas.toBuffer('image/png');
}

module.exports = { generateLevelUpCard };