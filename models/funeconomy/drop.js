const mongoose = require('mongoose');

// Cash yang di-drop di sebuah channel (sdrop) dan menunggu diambil (spickup).
const dropSchema = new mongoose.Schema({
    channelId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 }
}, { timestamps: true });

module.exports = mongoose.models.FunDrop || mongoose.model('FunDrop', dropSchema);