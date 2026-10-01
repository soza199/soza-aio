const { handleFunEconomy } = require('../funeconomy');

// Dimuat otomatis oleh handlers/events.js (semua file di folder events/).
module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        try {
            await handleFunEconomy(message, client);
        } catch (error) {
            console.error('[FUNECONOMY] Command error:', error);
            message.channel.send({
                content: '🚫 | Something went wrong, please try again.',
                allowedMentions: { parse: [] }
            }).catch(() => {});
        }
    }
};
