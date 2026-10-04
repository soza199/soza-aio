# Run the Discord bot on Replit

## Required secrets

Add these in Replit Secrets before starting the bot:

- `TOKEN` — Discord bot token
- `MONGODB_URI` — MongoDB connection URI

The bot exits with an explicit error if either value is missing. Other API keys are only needed for the optional features that use them.

## Start

Install the locked dependencies and start the bot:

```sh
pnpm install --frozen-lockfile
pnpm start
```

The bot runs as a background console process; it does not serve a web page.