const cfg = require('../config');
const Economy = require('../../models/funeconomy/economy');
const { fmt, send } = require('../utils');
const { escapeMarkdown } = require('discord.js');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
    name: 'lb',
    aliases: ['leaderboard'],
    async execute(message, args, client) {
        const rows = await Economy.top(10);
        if (rows.length === 0) {
            return send(message, `${cfg.EMOJI.TOP} | Nobody has any ${cfg.CASH_NAME} yet! Try \`${cfg.PREFIX}daily\`.`);
        }

        const lines = await Promise.all(rows.map(async (row, index) => {
            const user = await client.users.fetch(row.userId).catch(() => null);
            const name = escapeMarkdown(user?.username ?? 'Unknown User');
            const rank = MEDALS[index] ?? `\`#${index + 1}\``;
            return `${rank} **${name}** — ${cfg.CASH_EMOJI} ${fmt(row.cash)}`;
        }));

        return send(message, `${cfg.EMOJI.TOP} | **Top ${cfg.CASH_NAME} leaderboard**\n${lines.join('\n')}`);
    }
};
