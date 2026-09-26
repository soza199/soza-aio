---
name: Media provider failover
description: Reliability constraint for SFW image and GIF commands backed by mediacord.
---

Mediacord routes different SFW media actions to different external providers. A provider outage can break only a subset of commands, so retries against the same provider are not sufficient. The fallback provider also has a smaller reaction vocabulary, so some labels need a semantic fallback mapping.

**Why:** The imported bot's interaction GIFs using the waifu.pics route failed while commands using kawaii.red still worked; the Discord client only showed a generic interaction error.

**How to apply:** Keep provider failover at the shared media-resolution boundary, validate that a returned URL is non-empty, map unsupported labels to a close supported reaction, and keep the user-facing interaction acknowledged while the fallback is attempted.