const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const cfg = require('../config');
const Level = require('../../models/funeconomy/level');
const { progress, rewardForLevels } = require('../leveling');
const { fmt, displayName, send, sendEmbed, canEmbed, errorLine } = require('../utils');

const BAR_SIZE = 10;
const bar = (into, needed) => {
    const filled = Math.max(0, Math.min(BAR_SIZE, Math.floor((into / needed) * BAR_SIZE)));
    return '█'.repeat(filled) + '░'.repeat(BAR_SIZE - filled);
};

module.exports = {
    name: 'level',
    aliases: ['lvl', 'xp'],
    async execute(message, args, client) {
        const name = displayName(message);
        if (!canEmbed(message)) {
            return send(message, errorLine(name, 'I need the **Embed Links** permission in this channel to show your level!'));
        }

        let target = message.mentions.users.first() || null;
        const idArg = args.find((arg) => /^\d{17,20}$/.test(arg));
        if (!target && idArg) target = await client.users.fetch(idArg).catch(() => null);
        if (args.length > 0 && !target) {
            return send(message, errorLine(name, `wrong arguments! Usage: \`${cfg.PREFIX}level [@user]\``));
        }
        target = target || message.author;
        if (target.bot) return send(message, errorLine(name, "bots don't have a level!"));

        const profile = await Level.getProfile(target.id);
        const targetName = escapeMarkdown(
            target.id === message.author.id ? name : (message.guild.members.cache.get(target.id)?.displayName ?? target.username)
        );
        if (!profile) {
            return send(message, errorLine(name, `**${targetName}** hasn't registered yet! They need to use any economy command first.`));
        }

        const T = cfg.LEVELING;
        const { level, into, needed } = progress(profile.xp);
        const percent = Math.floor((into / needed) * 100);
        const nextReward = rewardForLevels(level, level + 1);

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`${targetName}'s Level`)
            .setDescription(
                `${cfg.EMOJI.LEVEL} **Level ${fmt(level)}**\n` +
                `\`${bar(into, needed)}\` ${fmt(into)} / ${fmt(needed)} XP (${percent}%)`
            )
            .addFields(
                { name: 'Total XP', value: fmt(profile.xp), inline: true },
                {
                    name: 'Today',
                    value: `${fmt(profile.chatXpToday)} / ${fmt(T.DAILY_CHAT_XP_CAP)} chat XP\n` +
                        `${profile.bonusClaimedToday ? '✅' : '⬜'} first message bonus`,
                    inline: true
                },
                {
                    name: 'Next reward',
                    value: `${cfg.CASH_EMOJI} ${fmt(nextReward)} at level ${fmt(level + 1)}`,
                    inline: true
                }
            )
            .setFooter({ text: `Chat to earn ${T.CHAT_XP_MIN}-${T.CHAT_XP_MAX} XP every minute, +${T.DAILY_COMMAND_XP} XP from ${cfg.PREFIX}daily` });

        const avatar = target.displayAvatarURL?.({ extension: 'png', size: 128 });
        if (avatar) embed.setThumbnail(avatar);
        return sendEmbed(message, embed);
    }
};