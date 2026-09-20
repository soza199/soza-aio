---
name: Riffy playback start
description: Riffy player creation and track resolution behavior relevant to playlist playback.
---

Riffy's `createPlayer()` establishes the voice request but playlist playback does not begin until `player.play()` is called after at least one resolved track is queued. Resolving a large Spotify collection sequentially before calling `play()` leaves the bot in voice with no audio or `trackStart` event.

**Why:** The Riffy play call selects and sends the current encoded track, while later collection searches are independent queue work. Delaying that call makes long playlists appear stuck.

**How to apply:** Queue and start the first successful result immediately, then resolve and append remaining tracks. Pass the selected node through Riffy's `resolve({ node })` option rather than relying on an unsupported node selector property.