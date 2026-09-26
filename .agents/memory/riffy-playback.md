---
name: Riffy playback start
description: Riffy player creation and track resolution behavior relevant to playlist playback.
---

Riffy's `createPlayer()` establishes the voice request but playlist playback does not begin until `player.play()` is called after at least one resolved track is queued. Resolving a large Spotify collection sequentially before calling `play()` leaves the bot in voice with no audio or `trackStart` event.

**Why:** The Riffy play call selects and sends the current encoded track, while later collection searches are independent queue work. Delaying that call makes long playlists appear stuck.

**How to apply:** Queue and start the first successful result immediately, then resolve and append remaining tracks. Pass the selected node through Riffy's `resolve({ node })` option rather than relying on an unsupported node selector property.

Lavalink may emit `TrackStartEvent` before YouTube rejects the actual source stream with `TrackExceptionEvent`, so a green voice connection or “Active” panel does not prove that audio is flowing.

**Why:** Track selection and source-stream acquisition happen as separate Lavalink steps.

**How to apply:** Remove stale now-playing UI on `trackError`/`trackStuck`, retry several distinct candidates, and destroy the player after bounded recovery attempts instead of leaving a silent session alive.

When a track error may be caused by a degraded Lavalink node, `client.riffy.migrate(player)` moves the active player to another connected node while preserving its voice state and queue.

**Why:** Riffy's public node list contains configuration objects, while connected runtime nodes live in `client.riffy.nodeMap`; recovery must select from the latter.

**How to apply:** Before retrying a failed track, migrate only when another connected node exists, then resolve replacement tracks against `player.node`.

Prefix `.play` playback should use the local DisTube/yt-dlp path for YouTube instead of public Lavalink extraction; the user confirmed this resolves the recurring unavailable-track behavior.

**Why:** Public Lavalink extractors can resolve a YouTube result successfully but fail when opening its audio stream.

**How to apply:** Keep Riffy for the slash music/Spotify path unless the local extractor is unavailable, and ensure stopping music cleans up both player engines.

Riffy's finite reconnect loop can leave a disconnected node in `nodeMap` after retries are exhausted, so recovery must reset/reconnect that node or recreate it from configuration.

**Why:** A missing `nodeDisconnect` cleanup path can make all later node selection report no healthy nodes until the bot process restarts.

**How to apply:** Keep a low-frequency watchdog for configured nodes; restore disconnected nodes without rebuilding the Discord client.

Autoplay tracks inherit the previous track's requester metadata from Riffy. For presentation, detect `track.isAutoplay` and label the requester as the bot while preserving the original requester metadata for control authorization.

**Why:** Riffy's autoplay resolver passes `player.previous.info.requester`, which otherwise makes an automatically selected track appear to have been requested by the last human user.

**How to apply:** Use the autoplay flag only for now-playing attribution; do not overwrite the underlying requester used by session and button-permission logic.