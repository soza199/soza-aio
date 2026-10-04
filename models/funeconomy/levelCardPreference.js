const mongoose = require('mongoose');

const levelCardPreferenceSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    backgroundBuffer: { type: Buffer, select: false }
}, { timestamps: true });

levelCardPreferenceSchema.statics.getBackgroundBuffer = async function getBackgroundBuffer(userId) {
    const preference = await this.findOne({ userId })
        .select('+backgroundBuffer')
        .lean();
    const backgroundBuffer = preference?.backgroundBuffer;
    return Buffer.isBuffer(backgroundBuffer)
        ? backgroundBuffer
        : backgroundBuffer
            ? Buffer.from(backgroundBuffer)
            : null;
};

levelCardPreferenceSchema.statics.setBackgroundBuffer = async function setBackgroundBuffer(userId, backgroundBuffer) {
    if (!Buffer.isBuffer(backgroundBuffer) || backgroundBuffer.length === 0 || backgroundBuffer.length > 2 * 1024 * 1024) {
        throw new Error('Invalid level card background image.');
    }
    return this.updateOne(
        { userId },
        { $set: { backgroundBuffer } },
        { upsert: true, setDefaultsOnInsert: true }
    );
};

levelCardPreferenceSchema.statics.resetBackground = async function resetBackground(userId) {
    return this.deleteOne({ userId });
};

module.exports = mongoose.models.LevelCardPreference
    || mongoose.model('LevelCardPreference', levelCardPreferenceSchema);