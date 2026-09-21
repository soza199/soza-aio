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