const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');
const { Economy, EconomyManager } = require('../../models/economy/economy');

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const BEG_COOLDOWN = 10 * 60 * 1000;

function money(value) {
    return `${Math.floor(value || 0).toLocaleString()} coins`;
}

function panel(title, body, color = 0x3498db) {
    return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${title}\n\n${body}`)
        );
}

async function reply(interaction, title, body, color) {
    const container = panel(title, body, color);
    if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
    return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
    });
}

function remainingText(check) {
    const { hours, minutes, seconds } = check.timeLeft;
    return `${hours ? `${hours}h ` : ''}${minutes ? `${minutes}m ` : ''}${seconds}s`;
}

async function changeBank(userId, guildId, amount, direction, bankLimit) {
    await EconomyManager.getProfile(userId, guildId);
    const now = new Date();
    const withdraw = direction === 'withdraw';
    const filter = { userId, guildId };
    const update = { $inc: {}, $push: {}, $set: { updatedAt: now } };

    if (withdraw) {
        filter.bank = { $gte: amount };
        update.$inc.bank = -amount;
        update.$inc.wallet = amount;
    } else {
        filter.wallet = { $gte: amount };
        filter.bank = { $lte: bankLimit - amount };
        update.$inc.wallet = -amount;
        update.$inc.bank = amount;
    }

    update.$push.transactions = {
        type: 'transfer',
        amount,
        description: withdraw ? 'Bank withdrawal' : 'Bank deposit',
        category: 'bank',
        timestamp: now
    };

    return Economy.findOneAndUpdate(filter, update, { new: true, runValidators: true });
}

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Manage your server coins')
        .addSubcommand(sub => sub
            .setName('balance')
            .setDescription('View your or another member’s wallet and bank')
            .addUserOption(option => option
                .setName('user')
                .setDescription('Member to check')))
        .addSubcommand(sub => sub
            .setName('daily')
            .setDescription('Claim your daily coin reward'))
        .addSubcommand(sub => sub
            .setName('work')
            .setDescription('Work for a random coin payout'))
        .addSubcommand(sub => sub
            .setName('beg')
            .setDescription('Ask for a small chance at spare coins'))
        .addSubcommand(sub => sub
            .setName('deposit')
            .setDescription('Move wallet coins into your bank')
            .addIntegerOption(option => option
                .setName('amount')
                .setDescription('Amount to deposit')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000000000)))
        .addSubcommand(sub => sub
            .setName('withdraw')
            .setDescription('Move bank coins into your wallet')
            .addIntegerOption(option => option
                .setName('amount')
                .setDescription('Amount to withdraw')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000000000)))
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('See the wealthiest members in this server')),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'The economy is available inside servers only.', ephemeral: true });
        }

        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        try {
            if (subcommand === 'balance') {
                const target = interaction.options.getUser('user') || interaction.user;
                const profile = await EconomyManager.getProfile(target.id, guildId);
                return reply(
                    interaction,
                    `💰 ${target.username}’s balance`,
                    `**Wallet:** ${money(profile.wallet)}\n**Bank:** ${money(profile.bank)}\n**Total wealth:** ${money(profile.wallet + profile.bank)}\n**Level:** ${profile.level || 1}`,
                    0x2ecc71
                );
            }

            if (subcommand === 'daily') {
                const profile = await EconomyManager.getProfile(userId, guildId);
                const cooldown = EconomyManager.checkCooldown(profile, 'daily');
                if (cooldown.onCooldown) {
                    return reply(interaction, '⏰ Daily reward not ready', `Come back in **${remainingText(cooldown)}**.`, 0xf39c12);
                }

                const now = new Date();
                const streak = profile.cooldowns.daily &&
                    now.getTime() - profile.cooldowns.daily.getTime() < 2 * DAILY_COOLDOWN
                    ? (profile.dailyStreak || 0) + 1
                    : 1;
                const reward = 500 + Math.min(streak * 50, 1000);
                const updated = await EconomyManager.applyWalletTransaction(userId, guildId, reward, {
                    description: `Daily reward (${streak} day streak)`,
                    category: 'daily',
                    cooldownName: 'daily',
                    cooldownMs: DAILY_COOLDOWN,
                    extraInc: { experience: 5 },
                    extraSet: { dailyStreak: streak }
                });

                if (!updated) {
                    const latest = await EconomyManager.getProfile(userId, guildId);
                    const currentCooldown = EconomyManager.checkCooldown(latest, 'daily');
                    return reply(interaction, '⏰ Daily reward not ready',
                        currentCooldown.onCooldown ? `Come back in **${remainingText(currentCooldown)}**.` : 'Your balance changed while claiming. Please try again.',
                        0xf39c12);
                }

                return reply(interaction, '🎁 Daily reward claimed',
                    `You received **${money(reward)}**.\n**Streak:** ${streak} day${streak === 1 ? '' : 's'}\n**Wallet:** ${money(updated.wallet)}`,
                    0x2ecc71);
            }

            if (subcommand === 'work') {
                const profile = await EconomyManager.getProfile(userId, guildId);
                const cooldown = EconomyManager.checkCooldown(profile, 'work');
                if (cooldown.onCooldown) {
                    return reply(interaction, '⏰ Work shift unavailable', `You can work again in **${remainingText(cooldown)}**.`, 0xf39c12);
                }

                const base = Math.floor(Math.random() * 301) + 200;
                const multiplier = EconomyManager.calculateWorkMultiplier(profile);
                const familyEarnings = profile.properties.length > 0 && profile.familyMembers.length > 0
                    ? profile.familyMembers.reduce(
                        (sum, member) => sum + member.salary * member.workEfficiency * (member.bond / 100),
                        0
                    )
                    : 0;
                const earnings = Math.floor(base * multiplier) + Math.floor(familyEarnings);
                const updated = await EconomyManager.applyWalletTransaction(userId, guildId, earnings, {
                    description: 'Work earnings',
                    category: 'work',
                    cooldownName: 'work',
                    cooldownMs: 60 * 60 * 1000,
                    extraInc: { experience: 10 }
                });

                if (!updated) {
                    const latest = await EconomyManager.getProfile(userId, guildId);
                    const currentCooldown = EconomyManager.checkCooldown(latest, 'work');
                    return reply(interaction, '⏰ Work shift unavailable',
                        currentCooldown.onCooldown ? `You can work again in **${remainingText(currentCooldown)}**.` : 'Please try again.',
                        0xf39c12);
                }
                return reply(interaction, '💼 Shift complete',
                    `You earned **${money(earnings)}**.\n**Wallet:** ${money(updated.wallet)}\n**Work bonus:** ${multiplier.toFixed(2)}×\n**Family contribution:** ${money(familyEarnings)}`,
                    0x2ecc71);
            }

            if (subcommand === 'beg') {
                const profile = await EconomyManager.getProfile(userId, guildId);
                const cooldown = EconomyManager.checkCooldown(profile, 'beg');
                if (cooldown.onCooldown) {
                    return reply(interaction, '⏰ Give it a little time', `You can ask again in **${remainingText(cooldown)}**.`, 0xf39c12);
                }

                const won = Math.random() < 0.65;
                const amount = won ? Math.floor(Math.random() * 91) + 10 : 0;
                const updated = await EconomyManager.applyWalletTransaction(userId, guildId, amount, {
                    description: won ? 'Begging earnings' : 'Begging attempt',
                    category: 'begging',
                    cooldownName: 'beg',
                    cooldownMs: BEG_COOLDOWN,
                    transaction: won
                });
                if (!updated) {
                    return reply(interaction, '⏰ Give it a little time', 'You can ask again in a few minutes.', 0xf39c12);
                }
                return reply(interaction, won ? '🙏 Someone helped' : '😔 No luck this time',
                    won ? `You received **${money(amount)}**.\n**Wallet:** ${money(updated.wallet)}` : 'Nobody had spare coins today. Try again after the cooldown.',
                    won ? 0x2ecc71 : 0x95a5a6);
            }

            if (subcommand === 'deposit' || subcommand === 'withdraw') {
                const amount = interaction.options.getInteger('amount');
                const profile = await EconomyManager.getProfile(userId, guildId);
                const bankLimit = EconomyManager.getBankLimit(profile);
                if (subcommand === 'deposit' && profile.bank + amount > bankLimit) {
                    return reply(interaction, '🏦 Bank capacity reached',
                        `You can deposit at most **${money(Math.max(0, bankLimit - profile.bank))}**.\n**Bank limit:** ${money(bankLimit)}`,
                        0xf39c12);
                }

                const updated = await changeBank(userId, guildId, amount, subcommand, bankLimit);
                if (!updated) {
                    const latest = await EconomyManager.getProfile(userId, guildId);
                    const reason = subcommand === 'deposit'
                        ? `Your wallet has **${money(latest.wallet)}**.`
                        : `Your bank has **${money(latest.bank)}**.`;
                    return reply(interaction, '❌ Transfer not completed', `${reason} The requested amount is unavailable.`, 0xe74c3c);
                }
                return reply(interaction, subcommand === 'deposit' ? '🏦 Deposit complete' : '💳 Withdrawal complete',
                    `Moved **${money(amount)}**.\n**Wallet:** ${money(updated.wallet)}\n**Bank:** ${money(updated.bank)}`,
                    0x2ecc71);
            }

            if (subcommand === 'leaderboard') {
                const leaders = await Economy.aggregate([
                    { $match: { guildId } },
                    { $addFields: { totalWealth: { $add: ['$wallet', '$bank'] } } },
                    { $sort: { totalWealth: -1 } },
                    { $limit: 10 }
                ]);
                if (!leaders.length) {
                    return reply(interaction, '🏆 Wealth leaderboard', 'No economy profiles exist in this server yet.', 0xf1c40f);
                }
                const rows = await Promise.all(leaders.map(async (entry, index) => {
                    const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
                    const name = member?.displayName || `Member ${entry.userId.slice(-4)}`;
                    return `**${index + 1}.** ${name} — ${money(entry.totalWealth)}`;
                }));
                return reply(interaction, '🏆 Server wealth leaderboard', rows.join('\n'), 0xf1c40f);
            }
        } catch (error) {
            console.error('Economy command failed:', error);
            return reply(interaction, '❌ Economy command failed', 'Your coins were not intentionally changed. Please try again later.', 0xe74c3c);
        }
    }
};