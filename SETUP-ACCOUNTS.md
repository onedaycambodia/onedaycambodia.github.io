# Customer accounts (Login + My Orders)

## Option A — "Log in with Telegram" (FREE, recommended)
1. In Telegram open @BotFather -> create a NEW bot (do not reuse the admin bot) -> open it (Mini App) -> **Login Widget**.
2. **Allowed URLs**: add  `https://onedaycambodia.github.io`  AND  `https://onedaycambodia.github.io/`
   (use your real site address; the redirect must match exactly what the site opens).
3. Copy the **Client ID** and **Client Secret** shown there.
4. Railway -> Variables:  `TG_CLIENT_ID` = Client ID,  `TG_CLIENT_SECRET` = Client Secret. Redeploy.
5. Upload index.html, server.js, customers.js to GitHub.

## Option B — 4-digit code via Telegram Gateway (paid per code)
Only used when TG_CLIENT_ID / TG_CLIENT_SECRET are NOT set: set `GATEWAY_TOKEN` (gateway.telegram.org -> API; top up Budget).

If neither is set the feature is OFF and the shop works as before.

Flow (A): +Add to cart / Order Now (not logged in) -> "Log in with Telegram" -> Accept in Telegram -> logged in.
Name + verified phone come from Telegram. Login is kept in localStorage + a 13-month cookie.
Account icon in the top bar = My orders (Paid / Unpaid / Pay on delivery / Cancelled) and Log out.
After "Clear Safari data" the customer just taps Log in again; the same phone = same account and orders.
Note: Allow phone access when Telegram asks, otherwise login is refused (no phone = no account).
