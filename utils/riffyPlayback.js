function getRiffyQueuePosition(player) {
    const hasActiveTrack = Boolean(
        player?.current &&
        (player.playing || player.paused || player.__playStartPromise)
    );

    return hasActiveTrack
        ? player.queue.length + 1
        : player.queue.length;
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

module.exports = {
    getRiffyQueuePosition,
    startRiffyPlayerIfIdle
};
