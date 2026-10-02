const cfg = require('../config');
const { CATEGORIES, backfillGuild } = require('../../models/funeconomy/ranking');
const { fmt, send, errorLine, displayName } = require('../utils');
const view = require('../rankView');

const MEDALS = ['🥇', '🥈', '🥉'];

// Ranking ala "owo top". Contoh: slb | slb global | slb daily 5 | slb level g | slb guild
module.exports = {
    name: 'lb',
    aliases: ['leaderboard', 'rank', 'ranking'],
    async execute(message, args, client) {
        const name = displayName(message);
        const parsed = view.parseArgs(args, { allowCount: true });
        if (parsed.error) {
            return send(message, errorLine(name,
                `wrong arguments! Usage: \`${cfg.PREFIX}lb [cash|daily|level|guild] [global] [1-${cfg.RANK.MAX_COUNT}]\``));
        }

        const { category, scope, count } = parsed;
        // Level memakai data leveling per-server; kategori lain butuh daftar server tiap user
        if (scope === 'guild' && category !== 'level') await backfillGuild(message.guild);

        const rows = await CATEGORIES[category].top({ ...view.queryOptions(message, scope), limit: count });
        if (rows.length === 0) {
            return send(message, `${cfg.EMOJI.TOP} | Nobody is on this leaderboard yet! Try \`${cfg.PREFIX}daily\`.`);
        }

        const lines = await Promise.all(rows.map(async (row, index) => {
            const label = await view.resolveName(message, client, category, scope, row.id);
            const rank = MEDALS[index] ?? `\`#${index + 1}\``;
            return `${rank} **${label}** — ${view.valueText(category, row, scope)}`;
        }));

        const title = view.titleText(category, scope, rows.length, message.guild.name);
        return send(message, `${cfg.EMOJI.TOP} | **${title}**\n${lines.join('\n')}`);
    }
};
