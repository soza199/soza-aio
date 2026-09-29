---
name: Gemini API quota vs key status
description: Distinguishes local API-key state from Google Gemini provider quota and rate-limit failures.
---

An API key marked active in the bot only means it is stored, enabled, and not locally blocked. It does not guarantee that Google will accept the next request; provider-level 429 responses can still occur because of project/model RPM or quota limits.

**Why:** The Discord bot can successfully answer one message and fail the next while the same key remains active. The hosted Gemini product and Gemini API key usage also have separate service limits.

**How to apply:** Treat 429, quota, and resource-exhausted responses as temporary provider capacity/quota failures. Cool down the affected key, fail over only to keys with independent available quota, and tell the user to wait, check AI Studio usage, or enable billing rather than presenting the key as invalid.