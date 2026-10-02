const { startScheduler } = require('../funeconomy/lottery');

// Menjalankan undian lottery otomatis tiap pergantian hari. Dimuat otomatis oleh handlers/events.js.
module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        startScheduler(client);
    }
};