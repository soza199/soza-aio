const mongoose = require('mongoose');

const levelCardPreferenceSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    backgroundBuffer: { type: Buffer, select: false }
}, { timestamps: true });

function asBuffer(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value?.buffer && Buffer.isBuffer(value.buffer)) {
        const length = Number.isInteger(value.position) ? value.position : value.buffer.length;
        return Buffer.from(value.buffer.subarray(0, length));
    }
    if (ArrayBuffer.isView(value)) return Buffer.from(value);
    return null;
}

levelCardPreferenceSchema.statics.getBackgroundBuffer = async function getBackgroundBuffer(userId) {
    const preference = await this.findOne({ userId })
        .select('+backgroundBuffer');
    return asBuffer(preference?.backgroundBuffer);
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