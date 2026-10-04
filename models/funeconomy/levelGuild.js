const mongoose = require('mongoose');

const levelGuildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    announce: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.FunLevelGuild || mongoose.model('FunLevelGuild', levelGuildSchema);