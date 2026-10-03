const mongoose = require('mongoose');

// Small shared values for fun economy migration markers and the account number counter.
const metaSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.FunEconomyMeta || mongoose.model('FunEconomyMeta', metaSchema);