const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { shared } = require('./levelUpCard');
const { fmt } = require('./utils');

const { W, H, SCALE, ensureFont, font, roundRect, drawBackground, drawAvatar } = shared;

/** Perkecil font (bold) sampai teks muat dalam maxWidth. */
function fit(ctx, text, startSize, maxWidth, weight = 'bold', minSize = 20) {
    let size = startSize;
    ctx.font = font(size, weight);
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        ctx.font = font(size, weight);
    }
    return size;
}

/**
 * Kartu level ala OwO (PNG Buffer): avatar, nama, nama server, LVL, Rank, XP, dan progress bar.
 * @param {{ name: string, guildName?: string, avatarURL?: string|null, level: number,
 *           rank?: number|null, xp: number, needed: number }} opts
 *   xp = XP di level ini, needed = XP untuk naik ke level berikutnya.
 */
async function generateLevelCard({ name, guildName = '', avatarURL, level, rank, xp, needed, backgroundBuffer }) {
    ensureFont();
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    let backgroundImage = null;
    if (Buffer.isBuffer(backgroundBuffer)) {
        try {
            backgroundImage = await loadImage(backgroundBuffer);
        } catch (error) {
            console.error('[FUNECONOMY] Level card background failed:', error.message);
        }
    }

    ctx.save();
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.clip();
    drawBackground(ctx, backgroundImage);

    const avatarRight = await drawAvatar(ctx, avatarURL, name);
    const textX = avatarRight + 36;
    const rightEdge = W - 40;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;

    // nama
    ctx.fillStyle = '#ffffff';
    fit(ctx, name, 68, rightEdge - textX);
    ctx.fillText(name, textX, 108);

    // nama server
    if (guildName) {
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        fit(ctx, guildName, 40, rightEdge - textX, 'normal', 22);
        ctx.fillText(guildName, textX, 160);
    }

    // LVL + angka besar
    const baseline = 282;
    ctx.fillStyle = '#ffffff';
    ctx.font = font(40);
    ctx.fillText('LVL', textX, baseline);
    const lvlWidth = ctx.measureText('LVL ').width;
    const levelText = fmt(level);
    ctx.font = font(96);
    ctx.fillText(levelText, textX + lvlWidth, baseline);
    const levelEnd = textX + lvlWidth + ctx.measureText(levelText).width;

    // Rank + XP + progress bar di kanan angka level
    const barX = levelEnd + 28;
    const barW = rightEdge - barX;
    const barH = 24;
    const barY = baseline - barH;

    const rankLabel = 'Rank: ';
    const rankValue = rank ? `#${fmt(rank)}` : '-';
    const xpLabel = 'XP: ';
    const xpValue = `${fmt(xp)}/${fmt(needed)}`;

    let size = 26;
    const measure = () => {
        ctx.font = font(size);
        const labelW = ctx.measureText(rankLabel).width + ctx.measureText(xpLabel).width;
        ctx.font = font(size, 'normal');
        return labelW + ctx.measureText(rankValue).width + ctx.measureText(xpValue).width;
    };
    while (size > 12 && measure() + 16 > barW) size -= 1;

    const textY = barY - 14;
    ctx.font = font(size);
    ctx.fillText(rankLabel, barX, textY);
    const rankLabelW = ctx.measureText(rankLabel).width;
    ctx.font = font(size, 'normal');
    ctx.fillText(rankValue, barX + rankLabelW, textY);

    ctx.textAlign = 'right';
    ctx.fillText(xpValue, rightEdge, textY);
    const xpValueW = ctx.measureText(xpValue).width;
    ctx.font = font(size);
    ctx.fillText(xpLabel, rightEdge - xpValueW, textY);

    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // progress bar: garis luar putih, isi putih (minimal sedikit supaya terlihat)
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);
    const ratio = needed > 0 ? Math.max(0, Math.min(1, xp / needed)) : 0;
    const innerW = barW - 8;
    const fillW = xp > 0 ? Math.max(6, innerW * ratio) : 0;
    if (fillW > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(barX + 4, barY + 4, fillW, barH - 8);
    }

    ctx.restore();
    return canvas.toBuffer('image/png');
}

module.exports = { generateLevelCard };