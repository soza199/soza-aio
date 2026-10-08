const {
    getSpotifyTrackQueries,
    parseSpotifyUrl
} = require('./spotifyTracks');
const {
    hasActiveDisTubeQueue,
    setStablePlayerVolume
} = require('./musicAudio');
const { maximizeVoiceChannelBitrate } = require('./voiceQuality');
const {
    getRiffyQueuePosition,
    startRiffyPlayerIfIdle
} = require('./riffyPlayback');

async function stopRiffyPlayer(client, guildId) {
    const player = client.riffy?.players?.get(guildId);
    if (!player) return false;

    player.__manualStop = true;
    const cleanup = client.musicMessageManager?.cleanupGuildMessages?.(client, guildId);
    if (cleanup?.catch) await cleanup.catch(() => {});
    player.destroy();
    return true;
}

async function playSpotifyRequest(message, client, voiceChannel, query) {
    const request = await getSpotifyTrackQueries(query);
    const queries = request?.queries || [];
    if (!queries.length) {
        await message.reply('❌ No playable tracks were found in that Spotify link.');
        return;
    }

    const guildId = message.guild.id;
    const botVoiceChannel = message.guild.members.me?.voice.channel;
    if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
        await message.reply('❌ I am already playing in a different voice channel.');
        return;
    }

    await maximizeVoiceChannelBitrate(voiceChannel);

    let player = client.riffy?.players?.get(guildId);
    if (player?.voiceChannel && player.voiceChannel !== voiceChannel.id) {
        await message.reply('❌ I am already playing in a different voice channel.');
        return;
    }

    if (!player) {
        if (!client.riffy) {
            throw new Error('The Lavalink music player is not available.');
        }

        if (hasActiveDisTubeQueue(client, guildId)) {
            await client.distube.stop(guildId);
        }

        player = await client.riffy.createConnection({
            guildId,
            voiceChannel: voiceChannel.id,
            textChannel: message.channel.id,
            deaf: true
        });
    }

    player.textChannel = message.channel.id;
    setStablePlayerVolume(player);

    let added = 0;
    let firstTitle = null;
    let firstPosition = null;

    for (const trackQuery of queries) {
        const result = await client.riffy.resolve({
            query: trackQuery,
            requester: message.author
        });
        const track = result?.tracks?.[0];
        if (!track) continue;

        const requester = {
            id: message.author.id,
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL()
        };
        track.requester = requester;
        if (track.info) track.info.requester = requester;

        const queuePosition = getRiffyQueuePosition(player);
        player.queue.add(track);
        added++;

        if (added === 1) {
            firstTitle = track.info?.title || trackQuery;
            firstPosition = queuePosition;
            await startRiffyPlayerIfIdle(player);
        }
    }

    if (!added) {
        await message.reply('❌ No playable tracks were found for that Spotify link.');
        return;
    }

    const startNote = firstPosition === 0 ? '\n▶️ Starting now.' : '';
    await message.reply({
        content: `🎵 Added **${added}** track${added === 1 ? '' : 's'} from **${request.name || 'Spotify'}**.\n**First track:** ${firstTitle}\n📍 Position: **#${firstPosition}**${startNote}`,
        allowedMentions: { parse: [] }
    });
}

async function handlePrefixMusic(message, client, commandName, args) {
    if (commandName !== 'play' && commandName !== 'stop') return false;

    const guildId = message.guild.id;

    if (commandName === 'stop') {
        let stopped = await stopRiffyPlayer(client, guildId);
        if (client.distube?.getQueue?.(guildId)) {
            await client.distube.stop(guildId);
            await client.cleanupMusicMessages?.(guildId);
            stopped = true;
        }

        await message.reply(stopped
            ? '⏹️ Music stopped and the queue was cleared.'
            : 'There is no music playing in this server.');
        return true;
    }

    const query = args.join(' ').trim();
    if (!query) {
        await message.reply('❌ Please include a song name or link. Example: `.play Katy Perry`');
        return true;
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        await message.reply('❌ Join a voice channel before asking me to play music.');
        return true;
    }

    try {
        if (parseSpotifyUrl(query)) {
            await playSpotifyRequest(message, client, voiceChannel, query);
            return true;
        }

        if (!client.playMusic || !client.distube) {
            throw new Error('The local music player is not available yet.');
        }

        await stopRiffyPlayer(client, guildId);
        const queue = await client.playMusic(voiceChannel, query, {
            member: message.member,
            textChannel: message.channel
        });
        const songs = queue?.songs || [];
        const song = songs[songs.length - 1];
        const position = Math.max(0, songs.length - 1);

        await message.reply({
            content: `🎵 Added **${song?.name || query}** to the queue.\n📍 Position: **#${position}**${position === 0 ? '\n▶️ Starting now.' : ''}`,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error(`[PREFIX MUSIC] Failed to play in guild ${guildId}:`, error);
        await message.reply('❌ I could not start that track. Try a different song or link.');
    }

    return true;
}

module.exports = { handlePrefixMusic };
