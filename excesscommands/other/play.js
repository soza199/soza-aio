const { PermissionFlagsBits } = require('discord.js');
const { getSpotifyTrackQueries, parseSpotifyUrl } = require('../../utils/spotifyTracks');

function temporaryReply(message, content, timeout = 6000) {
    return message.reply(content).then(reply => {
        setTimeout(() => reply.delete().catch(() => {}), timeout);
        return reply;
    });
}

function withTimeout(promise, timeoutMs, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const guildPlayLocks = new Map();
const nodeHealthCache = new WeakMap();
let nodeResolutionQueue = Promise.resolve();
let distubeInitializationPromise = null;

function withGuildPlayLock(guildId, task) {
    const previous = guildPlayLocks.get(guildId) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    guildPlayLocks.set(guildId, current);

    return current.finally(() => {
        if (guildPlayLocks.get(guildId) === current) {
            guildPlayLocks.delete(guildId);
        }
    });
}

function destroyGuildPlayer(client, guildId) {
    const player = client.riffy?.players.get(guildId);
    if (!player) return;

    try {
        player.destroy();
    } catch (error) {
        console.warn(`[RIFFY] Could not destroy stale player for ${guildId}:`, error.message);
    }

    if (client.riffy.players.get(guildId) === player) {
        client.riffy.players.delete(guildId);
    }
}

function withNodeResolutionLock(task) {
    const run = nodeResolutionQueue.then(task);
    nodeResolutionQueue = run.catch(() => {});
    return run;
}

async function ensureDistube(client) {
    if (client.distube && typeof client.playMusic === 'function') {
        return true;
    }

    if (!distubeInitializationPromise) {
        distubeInitializationPromise = Promise.resolve()
            .then(() => require('../../handlers/distube')(client))
            .finally(() => {
                distubeInitializationPromise = null;
            });
    }

    try {
        await distubeInitializationPromise;
    } catch (error) {
        console.error('[DISTUBE] Lazy initialization failed:', error);
        return false;
    }

    return Boolean(client.distube && typeof client.playMusic === 'function');
}

function markNodeUnhealthy(node, error) {
    if (!node) return;

    nodeHealthCache.set(node, {
        healthy: false,
        checkedAt: Date.now(),
        error: error?.message || String(error || 'Unknown node failure')
    });
}

async function checkNodeHealth(node) {
    if (!node?.connected || !node.rest?.getStats) return false;

    const cached = nodeHealthCache.get(node);
    if (cached && Date.now() - cached.checkedAt < 30000) {
        return cached.healthy;
    }

    try {
        await withTimeout(
            node.rest.getStats(),
            5000,
            `Lavalink node health check (${node.name})`
        );
        nodeHealthCache.set(node, { healthy: true, checkedAt: Date.now() });
        return true;
    } catch (error) {
        markNodeUnhealthy(node, error);
        console.warn(`[RIFFY] Node ${node.name} failed health check:`, error.message);
        return false;
    }
}

async function waitForHealthyNode(client, timeoutMs = 15000, excludedNodes = new Set()) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const candidates = (client.riffy?.leastUsedNodes || [])
            .filter(node => !excludedNodes.has(node))
            .sort((a, b) => (a.rest?.calls || 0) - (b.rest?.calls || 0));

        for (const node of candidates) {
            if (await checkNodeHealth(node)) return node;
        }

        await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error('No healthy Lavalink nodes are available');
}

function isUsablePlayer(player, voiceChannelId) {
    return Boolean(
        player &&
        player.voiceChannel === voiceChannelId &&
        player.connected &&
        player.node?.connected
    );
}

function getPlaybackFailureMessage(error) {
    const message = String(error?.message || error || '').toLowerCase();

    if (message.includes('no lavalink nodes')) {
        return 'Tidak ada server Lavalink yang sedang online.';
    }

    if (message.includes('no healthy lavalink nodes')) {
        return 'Tidak ada server Lavalink yang merespons dengan sehat.';
    }

    if (message.includes('track search')) {
        return 'Server Lavalink tidak merespons pencarian lagu.';
    }

    if (message.includes('lavalink playback')) {
        return 'Server Lavalink tidak merespons saat memulai audio.';
    }

    if (message.includes('timed out') || message.includes('timeout')) {
        return 'Koneksi voice atau Lavalink belum siap. Tunggu beberapa detik lalu coba lagi.';
    }

    if (message.includes('no matches') || message.includes('load failed')) {
        return 'Lavalink tidak dapat menemukan atau memuat lagu tersebut.';
    }

    return 'Server musik gagal memproses lagu tersebut. Coba lagi sebentar lagi.';
}

module.exports = {
    async execute(message, args, client) {
        const query = args.join(' ').trim();
        if (!query) {
            return temporaryReply(message, '❌ Please provide a song name or URL.\nExample: `.play royalty`');
        }

        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return temporaryReply(message, '❌ Join a voice channel first, then use `.play <song>`.');
        }

        const botVoiceChannel = message.guild.members.me?.voice?.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
            return temporaryReply(message, '❌ I am already playing music in another voice channel.');
        }

        const permissions = voiceChannel.permissionsFor(client.user);
        if (
            !permissions?.has(PermissionFlagsBits.Connect) ||
            !permissions.has(PermissionFlagsBits.Speak)
        ) {
            return temporaryReply(message, '❌ I need **Connect** and **Speak** permission in that voice channel.');
        }

        const guildId = message.guild.id;
        const parsedSpotify = parseSpotifyUrl(query);

        // Prefix `.play` is the simple YouTube playback path. Prefer the
        // local yt-dlp-backed DisTube player here instead of sending every
        // YouTube request through public Lavalink extractors, which can return
        // a valid search result but reject the stream a few seconds later.
        // Keep Spotify on the Riffy path because this command already supports
        // Spotify collection expansion there.
        if (
            !parsedSpotify
        ) {
            if (!await ensureDistube(client)) {
                console.warn('[DISTUBE] Prefix music requested but DisTube is unavailable');
                return temporaryReply(message, '❌ Sistem musik sedang memulai. Coba lagi dalam beberapa detik.');
            }

            return withGuildPlayLock(guildId, async () => {
                destroyGuildPlayer(client, guildId);

                try {
                    console.log(`[DISTUBE] Prefix music route selected for guild ${guildId}: ${query}`);
                    await client.playMusic(voiceChannel, query, {
                        member: message.member,
                        textChannel: message.channel,
                        timeout: 60000
                    });

                    const reply = await message.reply(`🎵 Added **${query}** to the music queue.`);
                    setTimeout(() => reply.delete().catch(() => {}), 6000);
                } catch (error) {
                    console.error('[DISTUBE] Prefix music play error:', error);
                    const queue = client.distube.getQueue?.(guildId);
                    if (queue) {
                        await client.distube.stop(guildId).catch(() => {});
                    }

                    return temporaryReply(
                        message,
                        '❌ Saya tidak bisa memutar lagu itu melalui YouTube. Coba URL atau judul lagu lain.'
                    );
                }
            });
        }

        if (!client.riffy) {
            return temporaryReply(message, '❌ Sistem Spotify/Lavalink belum siap. Coba lagi dalam beberapa detik.');
        }

        return withGuildPlayLock(guildId, async () => {
        let spotifyRequest = parsedSpotify
            ? { ...parsedSpotify, name: null, queries: [], partial: false }
            : null;
        if (parsedSpotify) {
            try {
                const metadataRequest = await getSpotifyTrackQueries(query);
                if (metadataRequest) spotifyRequest = metadataRequest;
            } catch (error) {
                // A private link or a failed public metadata request can still
                // be playable by a Lavalink node with Spotify support.
                console.warn('Spotify metadata lookup failed; trying Lavalink directly:', error.message);
            }
        }

            const createPlayer = (node) => withTimeout(
                    client.riffy.createPlayer(node, {
                        guildId,
                        voiceChannel: voiceChannel.id,
                        textChannel: message.channel.id,
                        deaf: true
                    }),
                    15000,
                    'Lavalink voice connection'
                );

            const resolveTrack = (node, searchQuery = query) => withNodeResolutionLock(async () => {
                return withTimeout(
                    client.riffy.resolve({
                        query: searchQuery,
                        requester: message.author,
                        node
                    }),
                    20000,
                    'Track search'
                );
            });

            let lastAttemptNode = null;
            const playAttempt = async (forceFresh, excludedNodes) => {
                lastAttemptNode = null;

                if (forceFresh) {
                    destroyGuildPlayer(client, guildId);
                }

                let player = client.riffy.players.get(guildId);
                if (isUsablePlayer(player, voiceChannel.id) && await checkNodeHealth(player.node)) {
                    lastAttemptNode = player.node;
                } else {
                    if (player) destroyGuildPlayer(client, guildId);
                    lastAttemptNode = await waitForHealthyNode(client, 15000, excludedNodes);
                    player = await createPlayer(lastAttemptNode);
                }

                const queries = spotifyRequest?.queries?.length
                    ? spotifyRequest.queries
                    : [query];
                const tracks = [];
                let lastTrackError = null;
                let startedPlayback = false;
                const addTrackAndStart = async (track) => {
                    track.requester = {
                        id: message.author.id,
                        username: message.author.username,
                        avatarURL: message.author.displayAvatarURL()
                    };
                    if (track.info) track.info.requester = message.author;
                    tracks.push(track);
                    player.queue.add(track);

                    // Do not wait for the rest of a large playlist before
                    // starting audio. TrackStart (and the now-playing
                    // panel) should happen as soon as the first result
                    // is available; remaining results can fill the queue.
                    if (!startedPlayback && !player.playing && !player.paused) {
                        await withTimeout(player.play(), 20000, 'Lavalink playback');
                        startedPlayback = true;
                    }
                };

                // Prefer Lavalink's native Spotify loader. Nodes with the
                // Spotify source plugin can return the complete collection
                // (including 100+ tracks), unlike public page metadata which
                // is commonly limited to eight preview items.
                if (spotifyRequest?.type === 'playlist' || spotifyRequest?.type === 'album') {
                    try {
                        const collectionResult = await resolveTrack(lastAttemptNode, query);
                        if (
                            collectionResult?.loadType === 'playlist' &&
                            collectionResult.tracks?.length
                        ) {
                            spotifyRequest = {
                                ...spotifyRequest,
                                name: collectionResult.playlistInfo?.name || spotifyRequest.name,
                                partial: false
                            };
                            for (const track of collectionResult.tracks) {
                                await addTrackAndStart(track);
                            }
                            return { player, track: tracks[0], tracks };
                        }
                    } catch (error) {
                        console.warn('[RIFFY] Native Spotify collection load failed; using track fallback:', error.message);
                    }
                }

                for (const searchQuery of queries) {
                    try {
                        const result = await resolveTrack(lastAttemptNode, searchQuery);
                        if (result?.tracks?.length) {
                            await addTrackAndStart(result.tracks[0]);
                        }
                    } catch (error) {
                        lastTrackError = error;
                        console.warn(`[RIFFY] Could not resolve "${searchQuery}":`, error.message);
                    }
                }

                if (!tracks.length && lastTrackError) throw lastTrackError;
                if (!tracks.length) return { player, track: null, tracks };

                return { player, track: tracks[0], tracks };
            };

            try {
                const failedNodes = new Set();
                let result = null;
                let lastError = null;

                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        result = await playAttempt(attempt > 0, failedNodes);
                        lastError = null;
                        break;
                    } catch (attemptError) {
                        lastError = attemptError;

                        if (lastAttemptNode) {
                            failedNodes.add(lastAttemptNode);
                            markNodeUnhealthy(lastAttemptNode, attemptError);
                            console.warn(
                                `[RIFFY] Playback attempt ${attempt + 1} failed on ${lastAttemptNode.name}:`,
                                attemptError.message
                            );
                        } else {
                            console.warn(
                                `[RIFFY] Playback attempt ${attempt + 1} failed before node selection:`,
                                attemptError.message
                            );
                        }

                        destroyGuildPlayer(client, guildId);
                    }
                }

                if (!result) {
                    throw lastError || new Error('Playback failed after node failover attempts');
                }

                if (!result.track) {
                    return temporaryReply(message, `❌ No tracks found for **${query}**.`);
                }

                const position = result.player.queue.length;
                const addedCount = result.tracks?.length || 1;
                const collectionLabel = spotifyRequest?.type === 'album' ? 'album' : 'playlist';
                const partialWarning = spotifyRequest?.partial
                    ? '\n⚠️ Metadata publik Spotify hanya mengembalikan sebagian lagu. Tambahkan SPOTIFY_CLIENT_ID dan SPOTIFY_CLIENT_SECRET agar seluruh isi dimuat.'
                    : '';
                const reply = await message.reply(
                    spotifyRequest
                        ? `🎵 Spotify ${collectionLabel} **${spotifyRequest.name}** ditambahkan ke queue.\n✅ **${addedCount}** lagu berhasil ditambahkan.\n📍 Queue sekarang: **${position}** lagu${partialWarning}`
                        : `🎵 Added **${result.track.info.title}** to the queue.\n📍 Position: **#${position}**`
                );
                setTimeout(() => reply.delete().catch(() => {}), 6000);
            } catch (error) {
                console.error('Prefix music play error:', error);
                destroyGuildPlayer(client, guildId);
                return temporaryReply(
                    message,
                    `❌ Saya tidak bisa memutar lagu itu.\n${getPlaybackFailureMessage(error)}\n\nCoba lagi setelah beberapa detik.`
                );
            }
        });
    }
};