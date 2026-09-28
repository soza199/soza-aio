---
name: Birthday age timezone
description: Why birthday age calculations must use the configured local timezone instead of UTC.
---

Birthday age must be calculated from the birthday owner's configured timezone. A birthday announcement can run at local midnight while UTC is still on the previous calendar day, which otherwise makes the bot celebrate one year too early.

**Why:** The birthday scheduler respects each user's timezone, but a UTC-only age calculation can still return the previous age during the first local hours of the birthday.

**How to apply:** Use the stored IANA timezone for both the current local date and the birthday month/day comparison. Treat records without a confirmed birth year as unknown age.