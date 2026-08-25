# Meme Coin Momentum Scanner — Vercel Edition

This version fixes the iPhone/Safari local-file problem by moving all DEX API requests into a Next.js server route hosted by Vercel.

## What it does

- Scans current Solana or Base token candidates
- Runs API requests server-side
- Refreshes automatically every 30 seconds while the site is open
- Calculates 0–100 Momentum and Risk scores
- Uses DEX Screener community/profile/boost signals as a small part of the score
- Saves 70+ alerts in your browser
- Tracks observed +5 / +15 / +30 / +60 minute results when later scans see the same token
- Can be added to the iPhone Home Screen

It does **not** connect to a wallet or execute trades.

## Deploy with GitHub + Vercel

1. Create a new GitHub repository.
2. Upload every file and folder in this project to the repository.
3. In Vercel, choose **Add New → Project**.
4. Import the GitHub repository.
5. Vercel should automatically detect **Next.js**.
6. Leave the default build settings and click **Deploy**.
7. Vercel will give you an HTTPS URL such as `https://your-project.vercel.app`.
8. Open that URL on your iPhone.

No API keys or environment variables are required for this version.

## Add it to your iPhone Home Screen

In Safari:
1. Open your deployed Vercel URL.
2. Tap the Share button.
3. Tap **Add to Home Screen**.

## Important limitation

The website scans every 30 seconds while it is open. iOS may suspend a web app when it is fully backgrounded. True 24/7 alerting requires a persistent backend/database or scheduled service, which can be added later.

## Local test (optional)

Install Node.js 20+ and run:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
