const cfg = require('../config');
const { CATEGORIES, backfillGuild } = require('../../models/funeconomy/ranking');
const cooldown = require('../cooldown');
const { send, errorLine, displayName, onCooldown } = require('../utils');
const { escapeMarkdown } = require('discord.js');
const view = require('../rankView');

const ICONS = {
    money: cfg.CASH_EMOJI,
    daily: cfg.EMOJI.STREAK,
    level: cfg.EMOJI.LEVEL,
    guild: cfg.EMOJI.GUILD
};
const NAMES = { money: 'Cash', daily: 'Daily streak', level: 'Level', guild: 'This server' };

// Posisi kamu di ranking ala "owo my". Contoh: smy | smy daily | smy cash global
module.exports = {
    name: 'my',
    aliases: ['me'],
    async execute(message, args) {
        const name = displayName(message);
        const hasCategory = args.some((a) => view.CATEGORY_ALIASES[a.toLowerCase()]);
        const parsed = view.parseArgs(args, { allowCount: false });
        if (parsed.error) {
            return send(message, errorLine(name,
                `wrong arguments! Usage: \`${cfg.PREFIX}my [cash|daily|level|guild] [global]\``));
        }

        const userId = message.author.id;
        if (onCooldown(message, 'my')) return;
        const { scope } = parsed;
        if (scope === 'guild') await backfillGuild(message.guild);

        const categories = hasCategory ? [parsed.category] : ['money', 'daily', 'level', 'guild'];
        const where = scope === 'guild' ? escapeMarkdown(message.guild.name) : 'all servers';

        const lines = [];
        for (const category of categories) {
            // Ranking server selalu lintas-server; kategori lain mengikuti scope
            const catScope = category === 'guild' ? 'global' : scope;
            const result = await CATEGORIES[category].rankOf(userId, view.queryOptions(message, catScope));
            if (!result) {
                const none = category === 'daily' ? 'no active streak' : 'not ranked yet';
                lines.push(`${ICONS[category]} ${NAMES[category]}: *${none}*`);
            } else {
                lines.push(`${ICONS[category]} ${NAMES[category]}: **#${result.rank.toLocaleString('en-US')}** — ${view.valueText(category, result, catScope)}`);
            }
        }

        cooldown.start('my', userId);
        if (categories.length === 1) {
            return send(message, `${cfg.EMOJI.TOP} | **${name}**, your ranking in **${where}**:\n${lines[0]}`);
        }
        return send(message, `${cfg.EMOJI.TOP} | **${name}**, your rankings in **${where}**:\n${lines.join('\n')}`);
    }
};