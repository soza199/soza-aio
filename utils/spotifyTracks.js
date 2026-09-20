const { getData } = require('spotify-url-info')(fetch);
const { spotifyApiRequest } = require('./spotifyToken');

function parseSpotifyUrl(value) {
    const input = String(value || '').trim();

    try {
        const url = new URL(input);
        if (!/spotify(?:\.com)?$/i.test(url.hostname) &&
            !/\.spotify\.com$/i.test(url.hostname)) {
            return null;
        }

        const parts = url.pathname.split('/').filter(Boolean);
        const typeIndex = parts.findIndex(part => /^(track|playlist|album)$/i.test(part));
        const type = typeIndex >= 0 ? parts[typeIndex].toLowerCase() : null;
        const id = type ? parts[typeIndex + 1]?.match(/^[A-Za-z0-9]+/)?.[0] : null;

        return type && id ? { type, id } : null;
    } catch {
        return null;
    }
}

function toSearchQuery(track) {
    if (!track?.name || !Array.isArray(track.artists)) return null;
    const artists = track.artists.map(artist => artist?.name).filter(Boolean).join(', ');
    return artists ? `${track.name} - ${artists}` : track.name;
}

function buildTrackResponse(parsed, name, tracks, options = {}) {
    return {
        type: parsed.type,
        name: name || `Spotify ${parsed.type}`,
        queries: tracks.map(toSearchQuery).filter(Boolean),
        partial: Boolean(options.partial)
    };
}

function hasSpotifyApiCredentials() {
    return Boolean(
        process.env.SPOTIFY_CLIENT_ID?.trim() &&
        process.env.SPOTIFY_CLIENT_SECRET?.trim()
    );
}

function mapSpotifyApiTrack(track) {
    if (!track?.name || track.is_local) return null;

    return {
        name: track.name,
        artists: Array.isArray(track.artists) ? track.artists : []
    };
}

async function getSpotifyApiCollection(parsed) {
    if (parsed.type === 'track') {
        const data = await spotifyApiRequest(`/tracks/${parsed.id}?market=US`);
        return buildTrackResponse(parsed, data?.name, [mapSpotifyApiTrack(data)].filter(Boolean));
    }

    const collection = parsed.type === 'album'
        ? await spotifyApiRequest(`/albums/${parsed.id}?market=US`)
        : await spotifyApiRequest(
            `/playlists/${parsed.id}?fields=name,tracks(total)&market=US`
        );

    const tracks = [];
    let offset = 0;
    const limit = 50;
    const total = Number(collection?.tracks?.total) || 0;

    while (offset < total || (total === 0 && offset === 0)) {
        const endpoint = parsed.type === 'album'
            ? `/albums/${parsed.id}/tracks?market=US&limit=${limit}&offset=${offset}`
            : `/playlists/${parsed.id}/tracks?market=US&limit=${limit}&offset=${offset}`;
        const page = await spotifyApiRequest(endpoint);
        const items = Array.isArray(page?.items) ? page.items : [];
        const pageTracks = items
            .map(item => parsed.type === 'album' ? item : item?.track)
            .map(mapSpotifyApiTrack)
            .filter(Boolean);

        tracks.push(...pageTracks);

        if (!items.length || items.length < limit) break;
        offset += items.length;
    }

    return buildTrackResponse(parsed, collection?.name, tracks);
}

async function getSpotifyTrackQueriesFromPublicMetadata(url, parsed) {
    const data = await getData(url);
    const tracks = parsed.type === 'track'
        ? [{
            name: data?.title || data?.name,
            artists: Array.isArray(data?.artists) ? data.artists : []
        }]
        : Array.isArray(data?.trackList)
            ? data.trackList
                .filter(track => track?.title)
                .map(track => ({
                    name: track.title,
                    artists: track.subtitle
                        ? track.subtitle.split(',').map(name => ({ name: name.trim() })).filter(artist => artist.name)
                        : []
                }))
            : [];

    return buildTrackResponse(parsed, data?.title, tracks, {
        partial: parsed.type !== 'track'
    });
}

async function getSpotifyTrackQueries(url) {
    const parsed = parseSpotifyUrl(url);
    if (!parsed) return null;

    // Use the Web API when configured so albums/playlists are paginated instead
    // of being limited to the small trackList exposed by Spotify's public page.
    if (hasSpotifyApiCredentials()) {
        try {
            const response = await getSpotifyApiCollection(parsed);
            if (response.queries.length || parsed.type === 'track') return response;
        } catch (error) {
            console.warn(`[Spotify] API collection lookup failed, using public metadata: ${error.message}`);
        }
    }

    // Spotify's public page metadata is still useful when API credentials are
    // not configured, but it can contain only a partial collection.
    return getSpotifyTrackQueriesFromPublicMetadata(url, parsed);
}

module.exports = {
    getSpotifyTrackQueries,
    parseSpotifyUrl
};