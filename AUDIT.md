# Audit report / របាយការណ៍ Audit

## ⚠️ ធ្វើភ្លាមៗ (មុន deploy)
1. **Rotate Cloudinary API secret** (`s6A8…`) នៅ Cloudinary dashboard — វាធ្លាប់នៅក្នុង Git history រួចហើយ (កែ code មិនគ្រប់គ្រាន់ទេ)។
2. **ប្តូរ Bot password** (`onedaybyday` ធ្លាប់នៅក្នុង code) — ឥឡូវអានពី env `BOT_PASSWORD`។
3. កំណត់ env vars នៅ Railway: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `BOT_PASSWORD`, (ជម្រើស) `OWNER_CHAT_ID`។
4. បើ repo ជា public ត្រូវ purge history (git filter-repo) ឬ ធ្វើ repo ជា private។

## Fixed
| # | ធ្ងន់ | បញ្ហា | កែ |
|---|---|---|---|
| 1 | Critical | Cloudinary key+secret hardcode (៣កន្លែង) | អានពី env |
| 2 | Critical | Bot password hardcode, គ្មាន brute-force limit | env `BOT_PASSWORD`, timing-safe, lock 15 នាទីក្រោយ ៥ ដង, លុបសារ password |
| 3 | Critical | `qty` អវិជ្ជមានក្នុង /api/order → សរុបអវិជ្ជមាន + ស្តុកកើន | qty ត្រូវជាចំនួនគត់ 1–20 |
| 4 | Critical | ទំនិញដដែលស្ទួនក្នុង cart → លក់ហួសស្តុក | បូកបញ្ចូលគ្នា + `stock_qty >= qty` guard |
| 5 | Critical | `transfer_own`: SQL ២ params ទៅ 1 placeholder → fail ជានិច្ច ហើយបាត់ Owner ចោល | transaction + query ត្រឹមត្រូវ |
| 6 | Critical | `/setmeowner` បើកឱ្យអ្នកណាក៏បាន ពេលគ្មាន Owner | តម្រូវ admin ឬ `OWNER_CHAT_ID` |
| 7 | High | `isOwnerUser` ប្រៀបធៀប username ទទេ → អ្នកគ្មាន username អាចក្លាយជា Owner | guard `username != ''` |
| 8 | High | Admin ចាប់ដោយ username តែម្យ៉ាង (username អាចត្រូវគេយក) | username ប្រើបានតែ placeholder chat_id (<0) រហូតដល់ /start |
| 9 | High | Stored XSS: ឈ្មោះ/ពិពណ៌នា/URL ទំនិញ ចូល innerHTML ដោយមិន escape | `esc()` / `jsq()` ក្នុង index.html, admin.html, web-admin.html |
| 10 | High | confirm_order អាច confirm order ដែល CANCELLED/AWAITING; cancel_order restore ស្តុកពីរដង (double tap) | status-guard + transaction |
| 11 | High | Callback buttons គ្មាន admin check | middleware `bot.use` |
| 12 | High | `/api/products` & `/api/stock` បង្ហាញ `cost_price` ដល់សាធារណៈ | select តែ column សាធារណៈ |
| 13 | Medium | សារ Markdown fail ពេលឈ្មោះ/username មាន `_ * [` → admin មិនទទួល order | `escMd()` + plain-text fallback |
| 14 | Medium | `customer.userId/username` មិន validate → button URL ខុស → សារទាំងមូល fail | validate |
| 15 | Medium | `client.release()` ស្ទួន + order ជោគជ័យតែឆ្លើយ 500 ពេល notify fail | `released` flag, notify ក្រោយ commit |
| 16 | Medium | គ្មាន `bot.catch` → error មួយ handler បញ្ឈប់ polling; គ្មាន `pool.on('error')` | បន្ថែម |
| 17 | Medium | Cloudinary delete: video/3D មិនដែលលុប (resource_type) | detect ពី URL |
| 18 | Medium | `/api/check-admin` ជឿ id ពី browser | verify initData |
| 19 | Medium | ជាមួយ BOT_TOKEN ទទេ session key ថេរ → forge cookie | random key |
| 20 | Low | `/add`,`/un` regex ចាប់ `/address`, `/undo` ជាដើម → បន្ថែម/ban admin ខុស; `/deleteref 1-99999999` | regex ត្រឹម, cap ២០០ |
| 21 | Low | តម្លៃអវិជ្ជមាន (bot), URL មិនមែន https, err.message លេចធ្លាយ, rate-limit Map លេចចេញ memory, គ្មាន rate limit COD | កែ |

## មិនទាន់កែ (ណែនាំ)
- `web-admin.html` គឺគ្រាន់តែជាច្បាប់ចម្លង admin.html — **មិនមាន UI** សម្រាប់ `/api/web-admin/*` (login, products, orders, stats) ទេ ហើយបើកក្នុង browser ធម្មតាមិនបាន (ត្រូវការ Telegram Mini App)។
- `cors()` បើកទាំងអស់ — កំណត់ origin ជាក់លាក់។
- `bakong-khqr: "*"` — pin version។ ពិចារណា `helmet`។
- Hardcode URL Railway ពីរផ្សេងគ្នា (`control-stock-production…` ក្នុង server.js vs `onedaycambodiagithubio-production…` ក្នុង HTML)។
- `expires_at` ជា `TIMESTAMP` (គ្មាន timezone) — ប្តូរទៅ `TIMESTAMPTZ`។
- កុម្មង់ COD គ្មាន CAPTCHA/OTP — អាចមានកុម្មង់ក្លែងកាន់ស្តុក។
- មិនបានតេស្តដំណើរការជាមួយ DB/Telegram ពិត (គ្មាន network) — សូមតេស្តលើ staging មុន។
