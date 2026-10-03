const crypto = require('crypto');
const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    escapeMarkdown
} = require('discord.js');
const Economy = require('../../models/funeconomy/economy');
const Registration = require('../../models/funeconomy/registration');
const cfg = require('../../funeconomy/config');
const { formatDuration, sleep, animateSlotReels } = require('../../funeconomy/utils');
const cooldown = require('../../funeconomy/cooldown');
const { registerGate } = require('../../funeconomy/register');
const { dayNumber, msUntilReset, amountForStreak } =
    require('../../funeconomy/commands/daily')._internals;
const { spinReels, multiplierFor } =
    require('../../funeconomy/commands/slots')._internals;

const MAX_GIVE = Number.MAX_SAFE_INTEGER;

function money(value) {
    return `${cfg.CASH_EMOJI} ${Math.floor(value || 0).toLocaleString('en-US')} ${cfg.CASH_NAME}`;
}

function panel(title, body, color = 0x3498db) {
    return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n\n${body}`));
}

function show(interaction, title, body, color) {
    return interaction.editReply({
        components: [panel(title, body, color)],
        flags: MessageFlags.IsComponentsV2
    });
}

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Use the new global cash economy')
        .addSubcommand(sub => sub
            .setName('balance')
            .setDescription('Check your or another user’s cash balance')
            .addUserOption(option => option
                .setName('user')
                .setDescription('User whose cash balance to check')))
        .addSubcommand(sub => sub
            .setName('daily')
            .setDescription('Claim your daily cash reward'))
        .addSubcommand(sub => sub
            .setName('slots')
            .setDescription('Bet cash on the new slot machine')
            .addIntegerOption(option => option
                .setName('bet')
                .setDescription('Cash to bet')
                .setRequired(cfg.SLOTS_REQUIRE_AMOUNT)
                .setMinValue(cfg.MIN_BET)
                .setMaxValue(cfg.MAX_BET)))
        .addSubcommand(sub => sub
            .setName('coinflip')
            .setDescription('Bet cash on heads or tails')
            .addIntegerOption(option => option
                .setName('bet')
                .setDescription('Cash to bet')
                .setRequired(true)
                .setMinValue(cfg.MIN_BET)
                .setMaxValue(cfg.MAX_BET))
            .addStringOption(option => option
                .setName('side')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                )))
        .addSubcommand(sub => sub
            .setName('give')
            .setDescription('Send cash to another user')
            .addUserOption(option => option
                .setName('user')
                .setDescription('User who will receive the cash')
                .setRequired(true))
            .addIntegerOption(option => option
                .setName('amount')
                .setDescription('Amount of cash to send')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(MAX_GIVE)))
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('Show the top users by cash')),

    async execute(interaction) {
        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            // Semua subcommand economy membutuhkan akun aktif.
            const registerPrompt = await registerGate(interaction);
            if (registerPrompt) {
                return interaction.editReply({
                    components: [registerPrompt],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            if (subcommand === 'balance') {
                const target = interaction.options.getUser('user') || interaction.user;
                const balance = await Economy.getCash(target.id);
                const name = escapeMarkdown(target.username);
                return show(interaction, `${name}’s balance`, `**Cash:** ${money(balance)}`, 0x2ecc71);
            }

            if (subcommand === 'daily') {
                const now = Date.now();
                const result = await Economy.claimDaily(userId, dayNumber(now), amountForStreak);
                if (!result.claimed) {
                    return show(
                        interaction,
                        '⏰ Daily reward not ready',
                        `Your next daily reward is available in **${formatDuration(msUntilReset(now))}**.`,
                        0xf39c12
                    );
                }

                return show(
                    interaction,
                    '🎁 Daily cash claimed',
                    `You received **${money(result.amount)}**.\n` +
                    `**Streak:** ${result.streak} day${result.streak === 1 ? '' : 's'}\n` +
                    `**Cash:** ${money(result.cash)}`,
                    0x2ecc71
                );
            }

            if (subcommand === 'slots' || subcommand === 'coinflip') {
                const bet = interaction.options.getInteger('bet') ?? cfg.MIN_BET;
                await Economy.ensureAccount(userId);
                const balance = await Economy.getCash(userId);
                if (balance < bet) {
                    return show(
                        interaction,
                        '❌ Not enough cash',
                        `Your balance is **${money(balance)}**, which is not enough for that bet.`,
                        0xe74c3c
                    );
                }

                const game = subcommand === 'slots' ? 'slots' : 'cf';
                const wait = cooldown.remaining(game, userId);
                if (wait > 0) {
                    return show(
                        interaction,
                        '⏱ Slow down',
                        `Try this command again in **${cooldown.seconds(wait)}**.`,
                        0xf39c12
                    );
                }

                if (subcommand === 'slots') {
                    const reels = spinReels();
                    const multiplier = multiplierFor(reels);
                    const payout = bet * multiplier;
                    const updated = await Economy.settleBet(userId, bet, payout);
                    if (!updated) {
                        return show(interaction, '❌ Bet not placed', 'Your balance changed before the bet could be placed. Please try again.', 0xe74c3c);
                    }
                    cooldown.start('slots', userId);

                    const name = escapeMarkdown(interaction.user.username);
                    await animateSlotReels(reels, async (symbols, isFinal) => {
                        if (!isFinal) {
                            return show(
                                interaction,
                                '🎰 Slots',
                                `**${name}** bet ${money(bet)}\n\n${symbols.join('  |  ')}`,
                                0x3498db
                            );
                        }
                        return show(
                            interaction,
                            multiplier ? '🎰 Slots win' : '🎰 Slots',
                            `**Result:** ${symbols.join('  |  ')}\n` +
                            `**Bet:** ${money(bet)}\n**Payout:** ${money(payout)}${multiplier ? ` (${multiplier}×)` : ''}\n` +
                            `**Cash left:** ${money(updated.cash)}`,
                            multiplier ? 0x2ecc71 : 0xe74c3c
                        );
                    });
                    return;
                }

                const side = interaction.options.getString('side');
                const result = crypto.randomInt(2) === 0 ? 'heads' : 'tails';
                const won = result === side;
                const payout = won ? bet * 2 : 0;
                const updated = await Economy.settleBet(userId, bet, payout);
                if (!updated) {
                    return show(interaction, '❌ Bet not placed', 'Your balance changed before the bet could be placed. Please try again.', 0xe74c3c);
                }
                cooldown.start('cf', userId);
                const name = escapeMarkdown(interaction.user.username);
                const header = `**${name}** spent ${cfg.CASH_EMOJI} **${bet.toLocaleString('en-US')}** and chose **${side}**`;
                const resultEmoji = result === 'heads' ? cfg.COIN.HEADS : cfg.COIN.TAILS;
                await show(
                    interaction,
                    '🪙 Coinflip',
                    `${header}\nThe coin spins... ${cfg.COIN.SPINNING}`,
                    0x3498db
                );
                await sleep(cfg.COINFLIP_ANIMATION_MS);

                const outcome = won
                    ? `and you won ${cfg.CASH_EMOJI} **${(bet * 2).toLocaleString('en-US')}**!!`
                    : 'and you lost it all... :c';
                return show(
                    interaction,
                    won ? '🪙 Coinflip won' : '🪙 Coinflip',
                    `${header}\nThe coin spins... ${resultEmoji} ${outcome}\n\n**Cash left:** ${money(updated.cash)}`,
                    won ? 0x2ecc71 : 0xe74c3c
                );
            }

            if (subcommand === 'give') {
                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                if (target.bot) {
                    return show(interaction, '❌ Cash not sent', `You cannot give ${cfg.CASH_NAME} to bots.`, 0xe74c3c);
                }
                if (target.id === userId) {
                    return show(interaction, '❌ Cash not sent', `You cannot give ${cfg.CASH_NAME} to yourself.`, 0xe74c3c);
                }
                if (!(await Registration.isRegistered(target.id))) {
                    return show(interaction, '❌ Cash not sent', `${escapeMarkdown(target.username)} hasn’t registered yet. They need to use any economy command first.`, 0xe74c3c);
                }

                await Economy.ensureAccount(userId);
                const debited = await Economy.deduct(userId, amount);
                if (!debited) {
                    return show(interaction, '❌ Cash not sent', `You do not have enough ${cfg.CASH_NAME}.`, 0xe74c3c);
                }

                try {
                    await Economy.add(target.id, amount);
                } catch (error) {
                    await Economy.add(userId, amount).catch(refundError =>
                        console.error('[FUNECONOMY] Could not refund failed slash give:', refundError));
                    throw error;
                }

                return show(
                    interaction,
                    '💳 Cash sent',
                    `**${escapeMarkdown(interaction.user.username)}** sent **${money(amount)}** to **${escapeMarkdown(target.username)}**.`,
                    0x2ecc71
                );
            }

            if (subcommand === 'leaderboard') {
                const rows = await Economy.top(10);
                if (!rows.length) {
                    return show(interaction, '🏆 Cash leaderboard', `No one has ${cfg.CASH_NAME} yet. Try /economy daily.`, 0xf1c40f);
                }

                const medals = ['🥇', '🥈', '🥉'];
                const lines = await Promise.all(rows.map(async (row, index) => {
                    const user = await interaction.client.users.fetch(row.userId).catch(() => null);
                    const name = escapeMarkdown(user?.username || `User ${row.userId.slice(-4)}`);
                    return `${medals[index] || `#${index + 1}`} **${name}** — ${money(row.cash)}`;
                }));
                return show(interaction, '🏆 Cash leaderboard', lines.join('\n'), 0xf1c40f);
            }
        } catch (error) {
            console.error('[FUNECONOMY] Slash command failed:', error);
            return show(
                interaction,
                '❌ Economy command failed',
                'Please try again later. If your balance was affected, contact a server administrator.',
                0xe74c3c
            );
        }
    }
};