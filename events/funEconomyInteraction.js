const { BUTTON_PREFIX, handleButton } = require('../funeconomy/blackjack');

// Tombol Hit / Stand blackjack. Dimuat otomatis oleh handlers/events.js.
// Game disimpan di database, jadi tombol tetap bekerja setelah bot restart.
module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isButton() || !interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return;
        await handleButton(interaction, client);
    }
};