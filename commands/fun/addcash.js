const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const Economy = require('../../models/funeconomy/economy');
const cfg = require('../../funeconomy/config');

const MAX_GRANT = 1_000_000_000;

function money(value) {
    return `${cfg.CASH_EMOJI} ${Math.floor(value || 0).toLocaleString('en-US')} ${cfg.CASH_NAME}`;
}

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('addcash')
        .setDescription('Add cash to a user (bot creator only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => option
            .setName('user')
            .setDescription('User who receives the cash')
            .setRequired(true))
        .addIntegerOption(option => option
            .setName('amount')
            .setDescription(`Amount to add (1–${MAX_GRANT.toLocaleString()})`)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_GRANT)),

    async execute(interaction) {
        const ownerId = process.env.DISCORD_USER_ID;
        if (!ownerId || !/^\d{17,20}$/.test(ownerId)) {
            return interaction.reply({
                content: 'This command is disabled. Set DISCORD_USER_ID to the bot creator’s Discord user ID.',
                flags: MessageFlags.Ephemeral
            });
        }
        if (interaction.user.id !== ownerId) {
            return interaction.reply({
                content: 'Only the configured bot creator can use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const updated = await Economy.add(target.id, amount);
            return interaction.editReply({
                content: `Added **${money(amount)}** to **${target.username}**. New balance: **${money(updated.cash)}**.`
            });
        } catch (error) {
            console.error('[FUNECONOMY] Owner cash grant failed:', error);
            return interaction.editReply({
                content: 'Cash could not be added. Please try again later.'
            });
        }
    }
};