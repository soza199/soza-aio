/**
 * Resolve a media-cord image or GIF with a small retry budget.
 *
 * The upstream service occasionally returns an empty response or fails for a
 * single category. Retrying here keeps every media command consistent without
 * hiding a final failure from the interaction handler.
 */
async function fetchMedia(fetcher, label, attempts = 3) {
    if (typeof fetcher !== 'function') {
        throw new Error(`Media action "${label}" is not available.`);
    }

    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const result = await fetcher();
            const url = typeof result === 'string'
                ? result
                : result?.url || result?.image?.url || result?.data?.url;

            if (typeof url === 'string' && url.trim().length > 0) {
                return url;
            }

            throw new Error(`Media action "${label}" returned no URL.`);
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, 250 * attempt));
            }
        }
    }

    throw new Error(`Unable to load "${label}" after ${attempts} attempts: ${lastError?.message || 'unknown error'}`);
}

async function fetchGif(fetcher, label) {
    try {
        return await fetchMedia(fetcher, label, 2);
    } catch (primaryError) {
        // mediacord routes some SFW interactions through waifu.pics, which
        // can be unavailable independently from the other media providers.
        // OtakuGIFS exposes the same reaction names and is a reliable
        // last-resort provider for these GIF commands.
        const response = await fetch(
            `https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(label)}`,
            { signal: AbortSignal.timeout(8000) }
        );

        if (!response.ok) {
            throw new Error(`${primaryError.message}; fallback provider returned HTTP ${response.status}`);
        }

        const payload = await response.json();
        return fetchMedia(() => payload.url, label, 1);
    }
}

module.exports = { fetchMedia, fetchGif };