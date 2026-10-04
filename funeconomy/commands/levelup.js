const { PermissionsBitField } = require('discord.js');
const cfg = require('../config');
const Level = require('../../models/funeconomy/level');
const { displayName, send, errorLine } = require('../utils');

module.exports = {
    name: 'levelup',
    aliases: ['lvlup'],
    async execute(message, args) {
        const name = displayName(message);
        const choice = args[0]?.toLowerCase();
        if (args.length > 1 || (choice && !['on', 'off'].includes(choice))) {
            return send(message, errorLine(name, `wrong arguments! Usage: \`${cfg.PREFIX}levelup [on|off]\``));
        }

        const current = await Level.isAnnounceEnabled(message.guild.id);
        if (!choice) {
            return send(message, `${cfg.EMOJI.LEVEL} | Level up messages are **${current ? 'enabled' : 'disabled'}** in this server. ` +
                `Use \`${cfg.PREFIX}levelup ${current ? 'off' : 'on'}\` to change it.`);
        }

        if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return send(message, errorLine(name, 'you need the **Manage Server** permission to change this!'));
        }

        const enable = choice === 'on';
        await Level.setAnnounce(message.guild.id, enable);
        return send(message, enable
            ? `${cfg.EMOJI.LEVEL} | Level up messages are now **enabled** in this server.`
            : `${cfg.EMOJI.LEVEL} | Level up messages are now **disabled** in this server. Level rewards are still added to your ${cfg.CASH_NAME} automatically.`);
    }
};