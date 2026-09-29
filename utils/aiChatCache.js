const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

function getKey(guildId, channelId) {
    return `${guildId}:${channelId}`;
}

function get(guildId, channelId) {
    const key = getKey(guildId, channelId);
    const entry = cache.get(key);

    if (!entry) return undefined;

    if (Date.now() - entry.createdAt >= CACHE_TTL) {
        cache.delete(key);
        return undefined;
    }

    return entry.value;
}

function set(guildId, channelId, value) {
    cache.set(getKey(guildId, channelId), {
        value,
        createdAt: Date.now()
    });
}

function invalidateGuild(guildId) {
    const prefix = `${guildId}:`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}

module.exports = {
    get,
    set,
    invalidateGuild
};