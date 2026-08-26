# Drama Coin Bot — Setup Guide

Telegram Mini App: watch ads → earn DHC coin → unlock your own video content.
Stack: Node.js (Vercel serverless functions) + MongoDB + vanilla JS frontend.

## 1. MongoDB Atlas
1. https://cloud.mongodb.com → free cluster banao (jodi already na thake)
2. Database Access → notun user banao (ba age-r password reset koro jodi kokhono
   leak hoye thake — chat/screenshot-e password kokhono share koro na)
3. Network Access → "Allow access from anywhere" (0.0.0.0/0) add koro (Vercel-er
   IP fixed na, tai eta lagbe)
4. Connection string copy koro → `.env`-e `MONGODB_URI` e boshao

## 2. Telegram Bot
1. @BotFather → `/newbot` (ba existing bot hole, token **revoke + regenerate**
   koro jodi kokhono chat-e paste kore thako)
2. Notun token → `.env`-e `BOT_TOKEN`
3. @userinfobot-ke message diye tomar nijer numeric Telegram ID nao →
   `.env`-e `ADMIN_TELEGRAM_ID` (eta hocche shudhu tumi-i admin upload flow
   use korte parba, onno kew na)
4. Ekta **private channel** banao (video storage-er jonno) → bot-ke oi
   channel-e **admin** banao → channel ID nao (forward a message from the
   channel to @username_to_id_bot, or check bot's getUpdates) →
   `.env`-e `STORAGE_CHANNEL_ID` (format: `-100xxxxxxxxxx`)
5. BotFather → `/mybots` → bot select → **Bot Settings → Menu Button** →
   Mini App URL disho (Vercel deploy-er por, step 4-e paba)

## 3. Local setup
```bash
git clone <your-repo>
cd drama-coin-bot
cp .env.example .env
# .env file-e shob real value boshao (MONGODB_URI, BOT_TOKEN, etc.)
npm install
```

`.env` file **kokhono git-e commit hobe na** — `.gitignore`-e already add kora ache।

## 4. Deploy to Vercel
1. GitHub-e repo push koro (`.env` chara — `.gitignore` shudhu take)
2. https://vercel.com → "Add New Project" → GitHub repo import koro
3. Deploy-er age **Environment Variables** section-e `.env.example`-er shob
   variable gula real value diye add koro (MONGODB_URI, BOT_TOKEN,
   ADMIN_TELEGRAM_ID, STORAGE_CHANNEL_ID, ADMIN_PANEL_SECRET, ইত্যাদি)
4. Deploy → tomar URL pabe (jemon `https://drama-coin-bot.vercel.app`)

## 5. Connect the webhook (one-time, run locally)
```bash
node scripts/set-webhook.js https://your-project.vercel.app
```
Eta bot-ke bole dibe je Telegram theke asha shob message ekhon
`/api/webhook`-e pathaite hobe.

## 6. Set the Mini App URL in BotFather
BotFather → Menu Button → tomar Vercel URL (e.g. `https://drama-coin-bot.vercel.app`)

## 7. Admin panel
`https://your-project.vercel.app/admin` — login secret ta `ADMIN_PANEL_SECRET`
(jeta tumi `.env`-e set korecho)

**Video upload flow:**
1. Video-ta directly bot-ke DM koro (tumi je admin, `ADMIN_TELEGRAM_ID` diye
   bot chine nibe)
2. Bot ekta code reply korbe (e.g. `V7K2QX`)
3. Admin panel → Videos tab → code + title + thumbnail URL diye "Publish"

## Notes on scaling within Vercel's function limit
Shudhu **5-ta serverless function** ache (`webhook`, `user`, `content`,
`admin/manage`, `admin/stats`) — notun feature add korar shomoy age dekho
existing file-e `action`/`type`/`entity` query param diye fit kora jay kina,
notun `api/*.js` file banar age. Vercel Hobby plan-e 12-tar limit ache.

## Ads integration (pending)
Ekhon `app.js`-e ad-watch ekta placeholder delay diye simulate kora hocche.
Real rewarded-ad network (Adsgram, Monetag, ইত্যাদি) integrate korte hobe
`document.getElementById('watch-ad-btn')` click handler-er moddhe — shei
comment-ta code-e mark kora ache.
