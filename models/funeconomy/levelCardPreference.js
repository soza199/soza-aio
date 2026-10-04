const mongoose = require('mongoose');
const { DEFAULT_BACKGROUND_ID, CARD_BACKGROUNDS } = require('../../funeconomy/cardBackgrounds');

const levelCardPreferenceSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    backgroundId: {
        type: String,
        enum: [DEFAULT_BACKGROUND_ID, ...CARD_BACKGROUNDS.map((background) => background.id)],
        default: DEFAULT_BACKGROUND_ID
    }
}, { timestamps: true });

levelCardPreferenceSchema.statics.getBackgroundId = async function getBackgroundId(userId) {
    const preference = await this.findOne({ userId }).select('backgroundId').lean();
    return preference?.backgroundId || DEFAULT_BACKGROUND_ID;
};

levelCardPreferenceSchema.statics.setBackgroundId = async function setBackgroundId(userId, backgroundId) {
    if (![DEFAULT_BACKGROUND_ID, ...CARD_BACKGROUNDS.map((background) => background.id)].includes(backgroundId)) {
        throw new Error('Unknown level card background.');
    }
    return this.updateOne(
        { userId },
        { $set: { backgroundId } },
        { upsert: true, setDefaultsOnInsert: true }
    );
};

levelCardPreferenceSchema.statics.resetBackground = async function resetBackground(userId) {
    return this.deleteOne({ userId });
};

module.exports = mongoose.models.LevelCardPreference
    || mongoose.model('LevelCardPreference', levelCardPreferenceSchema);