const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

module.exports = async (client, config, colors) => {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFolders = fs.readdirSync(commandsPath);
    const enabledCommandFolders = commandFolders.filter(folder => config.categories[folder]);

    const commands = [];
    const guildCommands = [];

    for (const folder of enabledCommandFolders) {
        const commandFiles = fs.readdirSync(path.join(commandsPath, folder)).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, folder, file));
            // Commands are organized by folder, but older command modules do
            // not all declare their category explicitly. Use the folder as
            // the fallback so interactionCreate does not treat them as
            // category "undefined" and reject them as disabled.
            if (!command.category) {
                command.category = folder;
            }
            client.commands.set(command.data.name, command);
            const commandData = command.data.toJSON();
            if (command.registerGuildOnly) {
                guildCommands.push(commandData);
            } else {
                commands.push(commandData);
            }
        }
    }

    const token = process.env.TOKEN || config.token;
    if (!token) {
        throw new Error('TOKEN is missing. Add TOKEN to the Railway service variables.');
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const applicationId = client.application?.id || client.user.id;
    const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
    const globalRoute = Routes.applicationCommands(applicationId);

    try {
        const registeredCommands = await rest.get(globalRoute);

        console.log('\n' + '─'.repeat(40));
        console.log(`${colors.yellow}${colors.bright}⚡ SLASH COMMANDS${colors.reset}`);
        console.log('─'.repeat(40));
        console.log(`${colors.cyan}[ SCOPE  ]${colors.reset} Registering ${commands.length} standard commands globally (may take up to an hour to appear)`);

        if (registeredCommands.length !== commands.length) {
            console.log(`${colors.red}[ LOADER ]${colors.reset} ${colors.green}Loading Slash Commands 🛠️${colors.reset}`);
        }

        if (commands.length > 100) {
            throw new Error(`This app has ${commands.length} global commands; Discord allows at most 100.`);
        }

        // Keep public commands global. Creator-only commands use a guild scope
        // so they do not consume one of Discord's 100 global command slots.
        await rest.put(globalRoute, { body: commands });
        console.log(`${colors.green}[ LOADER ] Successfully loaded ${commands.length} global slash commands ✅${colors.reset}`);

        if (guildCommands.length && !guildId) {
            console.log(
                `${colors.yellow}[ OWNER  ] Creator-only commands were not registered. Set DISCORD_GUILD_ID to the target server ID.${colors.reset}`
            );
        } else if (guildCommands.length) {
            const guildRoute = Routes.applicationGuildCommands(applicationId, guildId);
            try {
                const registeredGuildCommands = await rest.get(guildRoute);
                for (const command of guildCommands) {
                    const existing = registeredGuildCommands.find(registered =>
                        registered.name === command.name &&
                        (registered.type ?? 1) === (command.type ?? 1)
                    );

                    if (existing) {
                        await rest.patch(
                            Routes.applicationGuildCommand(applicationId, guildId, existing.id),
                            { body: command }
                        );
                    } else {
                        await rest.post(guildRoute, { body: command });
                    }
                }
                console.log(
                    `${colors.green}[ OWNER  ] Successfully registered ${guildCommands.length} creator-only guild command(s) in ${guildId} ✅${colors.reset}`
                );
            } catch (error) {
                console.log(
                    `${colors.red}[ OWNER  ] Creator-only command registration failed: ${error.message}${colors.reset}`
                );
            }
        }
    } catch (error) {
        console.log(`${colors.red}[ ERROR ]${colors.reset} ${colors.red}Slash command registration failed: ${error.message}${colors.reset}`);
        throw error;
    }
};
