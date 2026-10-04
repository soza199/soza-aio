const { handleChat } = require('../funeconomy/levelUp');

// XP level dari obrolan; event loader memuat semua file JavaScript di events/.
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        try {
            await handleChat(message);
        } catch (error) {
            console.error('[FUNECONOMY] Chat XP error:', error);
        }
    }
};