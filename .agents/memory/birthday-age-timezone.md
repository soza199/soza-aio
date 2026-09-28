---
name: Birthday age timezone
description: Why birthday age calculations must use the configured local timezone instead of UTC.
---

Birthday age and days-until values must be calculated from the birthday owner's configured timezone. A birthday announcement can run at local midnight while UTC is still on the previous calendar day, which otherwise makes the bot celebrate one year too early or report one extra day remaining.

**Why:** The birthday scheduler respects each user's timezone, but UTC-only date calculations can still return the previous age or add an extra day during the first local hours.

**How to apply:** Use the stored IANA timezone for the current local date and compare birthday values from local day boundaries. Treat records without a confirmed birth year as unknown age.