function getRiffyQueuePosition(player) {
    return (player?.queue?.length || 0) + 1;
}

async function startRiffyPlayerIfIdle(player) {
    if (!player || !player.queue?.length || player.paused) return false;
    if (player.current && player.playing) return false;

    if (player.__playStartPromise) {
        return player.__playStartPromise;
    }

    const playPromise = Promise.resolve().then(() => player.play()).then(() => true);
    player.__playStartPromise = playPromise;

    try {
        return await playPromise;
    } finally {
        if (player.__playStartPromise === playPromise) {
            delete player.__playStartPromise;
        }
    }
}

async function startRiffyPlayerAndWaitForStart(player, riffy, timeoutMs = 20000) {
    if (!player || !player.queue?.length || player.paused) return false;
    if (player.current && player.playing) return false;

    if (player.__playStartPromise) {
        return player.__playStartPromise;
    }

    if (typeof riffy?.on !== 'function') {
        throw new Error('Riffy is unavailable, so playback could not be confirmed');
    }

    let timer;
    let onTrackStart;
    const trackStarted = new Promise(resolve => {
        onTrackStart = (startedPlayer, track) => {
            if (startedPlayer === player) resolve(track);
        };
        riffy.on('trackStart', onTrackStart);
    });
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Lavalink did not start playback within ${timeoutMs}ms`)),
            timeoutMs
        );
    });

    const playPromise = Promise.resolve().then(() => player.play());
    const startPromise = Promise.race([
        Promise.all([playPromise, trackStarted]).then(([, track]) => track),
        timeout
    ]).finally(() => {
        clearTimeout(timer);
        riffy.removeListener?.('trackStart', onTrackStart);
    });

    player.__playStartPromise = startPromise;
    try {
        return await startPromise;
    } finally {
        if (player.__playStartPromise === startPromise) {
            delete player.__playStartPromise;
        }
    }
}

module.exports = {
    getRiffyQueuePosition,
    startRiffyPlayerIfIdle,
    startRiffyPlayerAndWaitForStart
};
