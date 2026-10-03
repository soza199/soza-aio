/**
 * Kumpulan GIF interaksi (hug, pat, slap, ...) dari banyak sumber sekaligus.
 *
 * GIF yang baru ditampilkan dicatat per server dan aksi, agar hasilnya tidak
 * cepat berulang. Saat pool hampir habis, sumber-sumber diisi ulang.
 */
const { fetchGif } = require('./fetchMedia');

const POOL_MAX = 600;
const RECENT_MAX = 80;
const REFILL_BELOW = 10;
const TIMEOUT_MS = 8000;

const NEKOS_BEST = {
    bite: 'bite', cuddle: 'cuddle', handhold: 'handhold', highfive: 'highfive', hug: 'hug',
    kick: 'kick', kiss: 'kiss', pat: 'pat', poke: 'poke', punch: 'punch', slap: 'slap', tickle: 'tickle',
};
const WAIFU_PICS = {
    bite: 'bite', bonk: 'bonk', bully: 'bully', cuddle: 'cuddle', glomp: 'glomp', handhold: 'handhold',
    highfive: 'highfive', hug: 'hug', kick: 'kick', kiss: 'kiss', lick: 'lick', pat: 'pat',
    poke: 'poke', slap: 'slap', smack: 'smack',
};
const PURRBOT = {
    bite: 'bite', cuddle: 'cuddle', fluff: 'fluff', hug: 'hug', kiss: 'kiss', lick: 'lick',
    pat: 'pat', poke: 'poke', slap: 'slap', tickle: 'tickle',
};
const OTAKUGIFS = {
    airkiss: 'airkiss', bite: 'bite', brofist: 'brofist', cuddle: 'cuddle', glomp: 'hug',
    handhold: 'handhold', highfive: 'highfive', hug: 'hug', kick: 'punch', kiss: 'kiss', lick: 'lick',
    nuzzle: 'nuzzle', pat: 'pat', pinch: 'pinch', poke: 'poke', punch: 'punch', slap: 'slap',
    smack: 'smack', tickle: 'tickle', bully: 'slap', bonk: 'punch',
};

async function getJson(url, options = {}) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...options });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return res.json();
}

const isUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);

const SOURCES = [
    async function nekosBest(action) {
        const category = NEKOS_BEST[action];
        if (!category) return [];
        const data = await getJson(`https://nekos.best/api/v2/${category}?amount=20`);
        return (data.results || []).map((result) => result.url);
    },
    async function waifuPics(action) {
        const category = WAIFU_PICS[action];
        if (!category) return [];
        const data = await getJson(`https://api.waifu.pics/many/sfw/${category}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exclude: [] }),
        });
        return data.files || [];
    },
    async function purrbot(action) {
        const category = PURRBOT[action];
        if (!category) return [];
        const calls = Array.from({ length: 5 }, () =>
            getJson(`https://api.purrbot.site/v2/img/sfw/${category}/gif`)
                .then((data) => data.link)
                .catch(() => null));
        return Promise.all(calls);
    },
    async function otakuGifs(action) {
        const category = OTAKUGIFS[action];
        if (!category) return [];
        const calls = Array.from({ length: 6 }, () =>
            getJson(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(category)}`)
                .then((data) => data.url)
                .catch(() => null));
        return Promise.all(calls);
    },
];

const pools = new Map();
const recent = new Map();
const refilling = new Map();

function poolFor(action) {
    if (!pools.has(action)) pools.set(action, new Set());
    return pools.get(action);
}

function addToPool(action, urls) {
    const pool = poolFor(action);
    for (const url of urls) {
        if (!isUrl(url)) continue;
        if (pool.has(url)) continue;
        if (pool.size >= POOL_MAX) pool.delete(pool.values().next().value);
        pool.add(url);
    }
}

function refill(action, fallbackFetcher) {
    if (refilling.has(action)) return refilling.get(action);

    const pool = poolFor(action);
    const tasks = SOURCES.map((source) =>
        source(action)
            .then((urls) => addToPool(action, urls))
            .catch((error) => console.warn(`[GIFPOOL] ${source.name}/${action}: ${error.message}`)));

    if (typeof fallbackFetcher === 'function') {
        tasks.push((async () => {
            const urls = await Promise.all(Array.from({ length: 3 }, () =>
                fetchGif(fallbackFetcher, action).catch(() => null)));
            addToPool(action, urls);
        })());
    }

    const all = Promise.allSettled(tasks).finally(() => refilling.delete(action));
    const firstData = new Promise((resolve) => {
        const timer = setInterval(() => {
            if (pool.size > 0) {
                clearInterval(timer);
                resolve();
            }
        }, 100);
        all.finally(() => {
            clearInterval(timer);
            resolve();
        });
    });
    refilling.set(action, all);
    return firstData;
}

async function getInteractionGif(action, scope = 'global', fallbackFetcher) {
    const pool = poolFor(action);
    if (pool.size === 0) await refill(action, fallbackFetcher);
    if (pool.size === 0) throw new Error(`No GIF available for "${action}"`);

    const key = `${scope}:${action}`;
    const seen = recent.get(key) || [];
    const seenSet = new Set(seen);
    let fresh = [...pool].filter((url) => !seenSet.has(url));

    if (fresh.length < REFILL_BELOW) refill(action, fallbackFetcher).catch(() => {});

    if (fresh.length === 0) {
        const last = seen[seen.length - 1];
        recent.set(key, last ? [last] : []);
        fresh = [...pool].filter((url) => url !== last);
        if (fresh.length === 0) fresh = [...pool];
    }

    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    const history = recent.get(key) || [];
    history.push(pick);
    while (history.length > RECENT_MAX) history.shift();
    recent.set(key, history);
    return pick;
}

module.exports = { getInteractionGif, _internals: { pools, recent } };