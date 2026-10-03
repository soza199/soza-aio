/*
 ██████╗ ██╗      █████╗  ██████╗███████╗██╗   ██╗████████╗
██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝╚██╗ ██╔╝╚══██╔══╝
██║  ███╗██║     ███████║██████╗ █████╗   ╚████╔╝    ██║
██║   ██║██║     ██╔══██║╚════██╗██╔══╝    ╚██╔╝     ██║
╚██████╔╝███████╗██║  ██║██████╔╝███████╗   ██║      ██║
 ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝   ╚═╝      ╚═╝

-------------------------------------
📡 Discord : https://discord.gg/xQF9f9yUEM
🌐 Website : https://glaceyt.com
🎥 YouTube : https://youtube.com/@GlaceYT
✅ Verified | 🧩 Tested | ⚙️ Stable
-------------------------------------
> © 2025 GlaceYT.com | All rights reserved.
*/

const { SlashCommandBuilder } = require('@discordjs/builders');
const { runHelp, listCommandNames } = require('../../utils/helpMenu');

// Shared display for /help and prefix help.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays the command list and bot information')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed information about a specific command')
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = listCommandNames(interaction.client)
            .filter(name => name.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(name => ({ name: name.substring(0, 100), value: name }));

        await interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();

        await runHelp({
            client: interaction.client,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            query: interaction.options.getString('command'),
            send: (payload) => interaction.editReply(payload),
        });
    },
};