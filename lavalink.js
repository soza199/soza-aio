
const fs = require('fs');
const path = require('path');

const legacyNode = {
    name: "GlaceYT",
    password: "glace",
    host: "de-01.strixnodes.com",
    port: 2010,
    secure: false
};

function loadNodes() {
    const configuredNodes = process.env.LAVALINK_NODES_JSON?.trim();
    if (configuredNodes) {
        try {
            const parsed = JSON.parse(configuredNodes);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (error) {
            console.warn(`[Lavalink] Could not parse LAVALINK_NODES_JSON: ${error.message}`);
        }
    }

    const nodesFile = process.env.LAVALINK_NODES_FILE?.trim()
        || path.join(__dirname, 'lavalink', 'nodes.json');

    try {
        const parsed = JSON.parse(fs.readFileSync(nodesFile, 'utf8'));
        if (Array.isArray(parsed) && parsed.length > 0) {
            const uniqueNodes = new Map(
                parsed
                    .filter(node => node?.host && node?.port)
                    .map(node => [
                        `${String(node.host).trim().toLowerCase()}:${node.port}`,
                        node
                    ])
            );
            if (uniqueNodes.size > 0) return [...uniqueNodes.values()];
        }
    } catch (error) {
        console.warn(`[Lavalink] Could not load ${nodesFile}: ${error.message}`);
    }

    return [legacyNode];
}

const nodes = loadNodes();

module.exports = {
    enabled: true,
    lavalink: {
        nodes,
        defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || "ytsearch",
        restVersion: "v4"
    }
};




