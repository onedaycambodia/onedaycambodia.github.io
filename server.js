const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const translate = require('translate-google'); // 📦 Library សម្រាប់បកប្រែស្វ័យប្រវត្តិ
const bakong = require('./bakong'); // 💳 Bakong KHQR payments
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy; needed so req.ip is the real visitor
app.use(cors());
app.use(express.json());

// ✅ បិទ cache លើ API ទាំងអស់ ដើម្បីឱ្យស្តុកថ្មីបង្ហាញភ្លាម
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
});

// Only the picture/video folders are public. (Before, express.static('.') also served server.js and every other source file.)
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// ☁️ កំណត់តម្លៃ Cloudinary ជាមួយ API Key ដែលបានកែតម្រូវត្រឹមត្រូវ (មានលេខ 7 ពីរដង)
// 🔒 Secrets come from environment variables ONLY (set them on Railway). Never commit them to Git.
//   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET   (or a single CLOUDINARY_URL)
if (process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
} else if (!process.env.CLOUDINARY_URL) {
    console.error('⚠️ Cloudinary មិនទាន់កំណត់ (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET)!');
}

// 🌐 ផ្លូវទី ១: សម្រាប់ Website ធម្មតា (អតិថិជនចូលមើល និងកុម្មង់ទំនិញ)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🔒 ផ្លូវទី ២: សម្រាប់ Telegram Mini App (Admin គ្រប់គ្រងស្តុក)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ភ្ជាប់ Database ស្វ័យប្រវត្តិពី Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// 🔒 Telegram Bot Setup
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('⚠️ BOT_TOKEN មិនទាន់បានកំណត់នៅក្នុង Environment Variables ទេ!');
}
const bot = new Telegraf(BOT_TOKEN || 'NO_TOKEN_PROVIDED');

// A dropped DB connection must not crash the whole server.
pool.on('error', (err) => console.error('Postgres pool error:', err.message));
// Without this, ONE error inside any bot handler stops Telegram polling completely.
bot.catch((err, ctx) => console.error('Bot handler error:', err && err.message ? err.message : err));

// Escape text that is inserted into legacy-Markdown Telegram messages (a single "_" in a name/username
// used to make Telegram reject the whole message, so the admins never saw the order).
const escMd = (v) => String(v == null ? '' : v).replace(/([_*`\[\]])/g, '\\$1');
const isHttpsUrl = (v) => /^https:\/\/\S+$/i.test(String(v || '').trim());
const cleanTgUsername = (v) => { v = String(v || '').replace(/^@/, ''); return /^[A-Za-z0-9_]{3,32}$/.test(v) ? v : ''; };
const cleanTgId = (v) => { v = String(v || ''); return /^\d{1,15}$/.test(v) ? v : ''; };

// ⛔ Every inline-button press is admin-only (before, anybody could trigger e.g. confirm_order_N).
bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) {
        const ok = ctx.from && await isAdminUser(ctx.from.id, ctx.from.username || '');
        if (!ok) { try { await ctx.answerCbQuery('⛔️ គ្មានសិទ្ធិ!', { show_alert: true }); } catch (e) {} return; }
    }
    return next();
});

// Bot registration password: set BOT_PASSWORD on Railway (never in code).
const BOT_PASSWORD = process.env.BOT_PASSWORD || '';
const pwFails = new Map(); // chatId -> { n, until }
function safeStrEq(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const RAILWAY_HOST = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
    : 'https://control-stock-production-a855.up.railway.app';

// កន្លែងរក្សាទុកដំណាក់កាលបំពេញទិន្នន័យតាម Chat របស់ Admin ម្នាក់ៗ
let userStates = {};

// មុខងារពិនិត្យសិទ្ធិ Admin តាម chat_id ឬ username
async function isAdminUser(chatId, username) {
    try {
        let check = await pool.query(
            "SELECT * FROM admins WHERE chat_id = $1 OR (chat_id < 0 AND username != '' AND LOWER(username) = LOWER($2))",
            [chatId || 0, username || '']
        );
        return check.rows.length > 0;
    } catch (err) {
        console.error("Error checking admin:", err);
        return false;
    }
}

// មុខងារពិនិត្យថាតើ User នេះជា Owner (ម្ចាស់ហាង) មែនឬអត់
async function isOwnerUser(chatId, username) {
    try {
        let check = await pool.query(
            "SELECT * FROM admins WHERE (chat_id = $1 OR (chat_id < 0 AND username != '' AND LOWER(username) = LOWER($2))) AND is_owner = TRUE",
            [chatId || 0, username || '']
        );
        return check.rows.length > 0;
    } catch (err) {
        console.error("Error checking owner:", err);
        return false;
    }
}

// មុខងារបកប្រែស្វ័យប្រវត្តិពី ខ្មែរ ទៅ EN និង ZH
async function autoTranslate(text) {
    if (!text || text.trim() === '') return { en: '', zh: '' };
    try {
        let en = await translate(text, { from: 'km', to: 'en' });
        let zh = await translate(text, { from: 'km', to: 'zh-CN' });
        return { en, zh };
    } catch (err) {
        console.error("Translation error:", err);
        return { en: text, zh: text };
    }
}

// ☁️ Helper Function: ទាញយក File ពី Telegram រួច Upload ចូល Cloudinary ដោយផ្ទាល់ (ជាមួយ API Key ត្រូវគ្នា)
async function uploadTelegramFileToCloudinary(ctx, fileId, folderName = 'oneday_shop') {
    let linkObj = await ctx.telegram.getFileLink(fileId);
    let fileUrl = typeof linkObj === 'string' ? linkObj : (linkObj.href || linkObj.toString());
    
    let uploadResult = await cloudinary.uploader.upload(fileUrl, {
        folder: folderName,
        resource_type: 'auto'
    });

    return uploadResult.secure_url; // ទទួលបាន Link Cloudinary សុវត្ថិភាព ១០០%
}

// 🗑️ Helper Function: លុប File ចេញពី Cloudinary តាមរយៈ URL ចាស់
// (ដឹង resource_type ពី URL: image / video / raw — មុននេះវីដេអូមិនដែលត្រូវបានលុបទេ ព្រោះប្រើ image ជានិច្ច)
async function deleteCloudinaryFileByUrl(url) {
    if (!url || !/^https:\/\/res\.cloudinary\.com\//i.test(url)) return;
    try {
        const m = url.split('?')[0].match(/\/(image|video|raw)\/upload\/(.+)$/);
        if (!m) return;
        const resourceType = m[1];
        let segs = m[2].split('/');
        const vi = segs.findIndex(x => /^v\d+$/.test(x));
        if (vi >= 0) segs = segs.slice(vi + 1);      // drop transformations + version
        let publicId = decodeURIComponent(segs.join('/'));
        if (resourceType !== 'raw') publicId = publicId.replace(/\.[^./]+$/, '');
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
        console.log("Deleted old file from Cloudinary:", publicId);
    } catch (err) {
        console.error("Failed to delete from Cloudinary:", err);
    }
}

// 🖼️/🎥 Helper Function: ចាប់យក File Object ពីរូបភាព វីដេអូ GIF ឬ Document
function getTelegramMediaObject(msg) {
    if (msg.photo && msg.photo.length > 0) {
        return msg.photo[msg.photo.length - 1]; 
    }
    return msg.video || msg.video_note || msg.animation || msg.document || null;
}

// បង្បង្កើត Table ស្តុក ផលិតផល អដ្មេន បញ្ជីខ្មៅ និង ការកុម្មង់
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                ref VARCHAR(50) PRIMARY KEY,
                title_km VARCHAR(255),
                title_en VARCHAR(255),
                title_zh VARCHAR(255),
                desc_km TEXT,
                desc_en TEXT,
                desc_zh TEXT,
                gender VARCHAR(20),
                type VARCHAR(20),
                video_url TEXT,
                model_3d_url TEXT,
                price DECIMAL(10,2),
                cost_price DECIMAL(10,2) DEFAULT 0
            );
        `);

        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS title_en VARCHAR(255);`);
        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS title_zh VARCHAR(255);`);
        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS desc_en TEXT;`);
        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS desc_zh TEXT;`);
        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS model_3d_url TEXT;`);
        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0;`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS stock (
                id SERIAL PRIMARY KEY,
                ref VARCHAR(50),
                size VARCHAR(10),
                stock_qty INT,
                price DECIMAL(10,2),
                UNIQUE(ref, size)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchases (
                id SERIAL PRIMARY KEY,
                ref VARCHAR(50),
                size VARCHAR(10),
                qty INT,
                cost_price DECIMAL(10,2),
                total_cost DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS website_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS website_covers (
                id SERIAL PRIMARY KEY,
                cover_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT UNIQUE,
                username VARCHAR(255),
                is_owner BOOLEAN DEFAULT FALSE
            );
        `);
        await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS username VARCHAR(255);`);
        await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT FALSE;`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS banned_admins (
                id SERIAL PRIMARY KEY,
                chat_id BIGINT UNIQUE,
                username VARCHAR(255)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer TEXT,
                items JSONB,
                total DECIMAL(10,2),
                status VARCHAR(50) DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 💳 KHQR payment columns (safe to run repeatedly)
        await pool.query(`
            ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'COD',
                ADD COLUMN IF NOT EXISTS khqr_md5 VARCHAR(64),
                ADD COLUMN IF NOT EXISTS pay_amount DECIMAL(10,2),
                ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS manual_review BOOLEAN DEFAULT FALSE;
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_khqr_md5 ON orders (khqr_md5);`);
        await bakong.init(pool); // persistent Bakong call counter (survives restarts)

        console.log("Database initialized successfully.");
    } catch (err) {
        console.error("Database initialization error:", err);
    }
}
initDB();

// --- API ENDPOINTS ---

app.get('/api/website-settings', async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM website_settings");
        let settings = {};
        result.rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        console.error('api error:', err.message); res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/website-covers', async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM website_covers ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        console.error('api error:', err.message); res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/delivery-fee', async (req, res) => {
    try {
        let result = await pool.query("SELECT value FROM website_settings WHERE key = 'delivery_fee'");
        let fee = result.rows.length > 0 ? result.rows[0].value : '2.00';
        res.json({ delivery_fee: fee });
    } catch (err) {
        console.error('api error:', err.message); res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const query = `
            SELECT p.ref, p.title_km, p.title_en, p.title_zh, p.desc_km, p.desc_en, p.desc_zh,
                   p.gender, p.type, p.video_url, p.model_3d_url, p.price,
                   COALESCE(json_agg(json_build_object('size', s.size, 'stock_qty', s.stock_qty)) FILTER (WHERE s.size IS NOT NULL), '[]') as sizes
            FROM products p
            LEFT JOIN stock s ON p.ref = s.ref
            GROUP BY p.ref
            ORDER BY NULLIF(regexp_replace(p.ref, '\\D', '', 'g'), '')::NUMERIC DESC NULLS LAST, p.ref DESC;
        `;
        let result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('api error:', err.message); res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/stock', async (req, res) => {
    try {
        let result = await pool.query("SELECT id, ref, size, stock_qty, price FROM stock ORDER BY NULLIF(regexp_replace(ref, '\\D', '', 'g'), '')::NUMERIC ASC NULLS LAST, ref ASC, size");
        res.json(result.rows);
    } catch (err) {
        console.error('api error:', err.message); res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/check-admin', async (req, res) => {
    try {
        const who = await webAdmin.authorize(req); // verifies the signed Telegram initData / session cookie
        res.json({ authorized: !!who });
    } catch (err) {
        console.error('check-admin error:', err.message);
        res.status(500).json({ authorized: false });
    }
});

app.post('/api/admin/update-stock', async (req, res) => {
    let { ref, size, qty } = req.body;
    try {
        if (!(await webAdmin.authorize(req))) return res.status(401).json({ success: false, error: 'Unauthorized' });
        qty = parseInt(qty, 10);
        if (!Number.isInteger(qty) || qty < 0 || qty > 100000) return res.status(400).json({ success: false, error: 'Invalid qty' });
        let cleanRef = String(ref || '').replace(/ref:?\s*/i, '').trim().toUpperCase();
        let cleanSize = String(size || '').trim().toUpperCase();
        await pool.query(
            "UPDATE stock SET stock_qty = $1 WHERE UPPER(ref) = $2 AND UPPER(size) = $3",
            [qty, cleanRef, cleanSize]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('update-stock error:', err.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// 🖥️ Web admin (browser version of the bot's admin tools): /web-admin
const webAdmin = require('./webadmin')(app, {
    pool, bot, cloudinary, autoTranslate, isAdminUser, deleteCloudinaryFileByUrl, restoreStockForItems, botToken: BOT_TOKEN
});

// 👤 Customer accounts (login by phone + Telegram Gateway code, My Orders). OFF unless GATEWAY_TOKEN is set.
const customers = require('./customers')(app, { pool });
const wallet = require('./wallet')(app, { pool, bakong, customers });

// ---------------- 💳 KHQR / BAKONG PAYMENT ----------------
const KHQR_EXPIRE_MINUTES = Number(process.env.KHQR_EXPIRE_MINUTES) || 3; // QR lifetime; also the stock-hold time for unpaid orders
const khqrRateMap = new Map(); // ip -> [timestamps], stops someone locking all stock with unpaid QR orders

function khqrRateLimited(ip) {
    const now = Date.now();
    const recent = (khqrRateMap.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
    if (recent.length >= 5) { khqrRateMap.set(ip, recent); return true; }
    recent.push(now);
    khqrRateMap.set(ip, recent);
    return false;
}

// general per-IP limiter (used for orders / claims) + periodic cleanup so the Maps do not grow forever
const ipHits = new Map();
function ipLimited(key, max, windowMs) {
    const now = Date.now();
    const hits = (ipHits.get(key) || []).filter(t => now - t < windowMs);
    hits.push(now);
    ipHits.set(key, hits);
    return hits.length > max;
}
setInterval(() => {
    const now = Date.now();
    for (const m of [khqrRateMap, ipHits]) for (const [k, v] of m) if (!v.length || now - v[v.length - 1] > 3600000) m.delete(k);
}, 10 * 60 * 1000).unref();

// Ask Bakong whether this order has been paid.
async function checkOrderPaid(o, priority = 'auto') {
    return bakong.isEnabled() ? bakong.checkPaid(o.khqr_md5, o.pay_amount, priority) : { state: 'UNPAID' };
}

async function getDeliveryFeeNumber() {
    const r = await pool.query("SELECT value FROM website_settings WHERE key = 'delivery_fee'");
    const val = r.rows.length > 0 ? String(r.rows[0].value).trim() : '2.00';
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n; // same rule as the website: text such as "pay at shop" = 0
}

async function restoreStockForItems(db, items) {
    items = typeof items === 'string' ? JSON.parse(items) : items;
    for (let key in items) {
        let item = items[key];
        await db.query(
            "UPDATE stock SET stock_qty = stock_qty + $1 WHERE UPPER(ref) = $2 AND UPPER(size) = $3",
            [parseInt(item.qty) || 0, String(item.ref).toUpperCase(), String(item.size).toUpperCase()]
        );
    }
}

// The customer picks a spot on the map in the browser; it arrives as "lat, lng" in customer.mapUrl.
// Validate it strictly (it ends up in a Telegram message and a button URL) and build the links the admins need.
function mapInfo(customer) {
    const raw = String((customer && (customer.mapUrl || customer.map)) || '').replace(/\s+/g, '');
    const m = raw.match(/^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null;
    const c = lat.toFixed(6) + ',' + lng.toFixed(6);
    return { lat, lng, coords: lat.toFixed(6) + ', ' + lng.toFixed(6), url: 'https://www.google.com/maps?q=' + c };
}

async function sendOrderToAdmins(orderId, customer, itemsSummary, totalAmount, headerExtra) {
    let adminsRes = await pool.query("SELECT chat_id FROM admins WHERE chat_id IS NOT NULL");
    if (adminsRes.rows.length === 0) return;
    customer = customer || {};
    let custName = escMd(customer.name || customer.fullName || 'អតិថិជនមិនបញ្ចេញឈ្មោះ');
    let custPhone = escMd(customer.phone || customer.phoneNumber || 'គ្មានលេខទូរស័ព្ទ');
    let custAddress = escMd(customer.address || customer.location || 'គ្មានអាសយដ្ឋាន');
    let userId = cleanTgId(customer.userId || customer.telegramId);
    let username = cleanTgUsername(customer.username);

    let msg = `📦 **មានការកុម្មង់ទំនិញថ្មី!** (#Order ID: ${orderId})\n${headerExtra || ''}\n`;
    msg += `👤 **ព័ត៌មានអតិថិជន:**\n- ឈ្មោះ: ${custName}\n- លេខទូរស័ព្ទ: ${custPhone}\n- អាសយដ្ឋាន: ${custAddress}\n`;
    if (userId) msg += `- Telegram ID: \`${userId}\`\n`;
    if (username) msg += `- Username: @${escMd(username)}\n`;
    const mi = mapInfo(customer);
    if (mi) msg += `📍 **ទីតាំង Map:** ${mi.coords}\n🗺 ${mi.url}\n`;
    msg += `\n🛒 **ទំនិញកុម្មង់:**\n`;
    (Array.isArray(itemsSummary) ? itemsSummary : Object.values(itemsSummary || {})).forEach((it, idx) => {
        msg += `${idx + 1}. Ref: ${escMd(it.ref)} - ${escMd(it.title)} (Size: ${escMd(it.size)}) x ${it.qty} = $${Number(it.total).toFixed(2)}\n`;
    });
    msg += `\n💵 **សរុបទឹកប្រាក់:** $${Number(totalAmount).toFixed(2)}`;

    let inlineKeyboard = [[
        { text: '✅ Confirm Order', callback_data: `confirm_order_${orderId}` },
        { text: '❌ Cancel & Restore Stock', callback_data: `cancel_order_${orderId}` }
    ]];
    if (userId) inlineKeyboard.push([{ text: '💬 ឆាតទៅកាន់អតិថិជន', url: `tg://user?id=${userId}` }]);
    else if (username) inlineKeyboard.push([{ text: '💬 ឆាតទៅកាន់អតិថិជន', url: `https://t.me/${username}` }]);

    if (mi) inlineKeyboard.push([{ text: "📍 បើក Map", url: mi.url }]);
    for (let adm of adminsRes.rows) {
        try {
            await bot.telegram.sendMessage(adm.chat_id, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } });
        } catch (e) {
            // last resort: plain text, so an odd character can never hide a paid order from the admins
            try { await bot.telegram.sendMessage(adm.chat_id, msg.replace(/\\([_*`\[\]])/g, '$1').replace(/\*/g, ''), { reply_markup: { inline_keyboard: inlineKeyboard } }); }
            catch (e2) { console.error('order notify failed:', e2.message); }
        }
    }
}

// Mark an awaiting order as paid exactly once (the status guard makes double-calls harmless), then tell the admins.
async function markOrderPaid(orderId) {
    const r = await pool.query(
        "UPDATE orders SET status = 'PENDING', paid_at = NOW() WHERE id = $1 AND status = 'AWAITING_PAYMENT' RETURNING *",
        [orderId]
    );
    if (r.rows.length === 0) return false; // someone else already handled it
    const o = r.rows[0];
    console.log(`Payment received: order ${o.id} via ${o.payment_method} $${o.pay_amount}`);
    const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
    const customer = typeof o.customer === 'string' ? JSON.parse(o.customer) : o.customer;
    await sendOrderToAdmins(o.id, customer, items, o.pay_amount || o.total, `✅ **បង់ប្រាក់រួចរាល់តាម KHQR (Bakong) $${Number(o.pay_amount).toFixed(2)}**\n`);
    return true;
}

// Release the reserved stock of an unpaid order. Returns true if this call did the expiring.
async function expireOrder(orderId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            "UPDATE orders SET status = 'EXPIRED' WHERE id = $1 AND status = 'AWAITING_PAYMENT' RETURNING items",
            [orderId]
        );
        if (r.rows.length === 0) { await client.query('ROLLBACK'); return false; }
        await restoreStockForItems(client, r.rows[0].items);
        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('expireOrder error:', err);
        return false;
    } finally {
        client.release();
    }
}

app.get('/api/payment-config', (req, res) => {
    res.json({ khqr_enabled: bakong.isEnabled(), expire_minutes: KHQR_EXPIRE_MINUTES });
});

// ---- Manual-confirmation fallback -------------------------------------------------------------
// When Bakong cannot answer (daily quota used up, token problem, ...) we must NEVER guess "unpaid" and expire
// the order: the customer may really have paid. Instead the order is flagged, kept for a grace period, and the
// admins get a Telegram message with buttons to confirm / cancel it by hand.
const KHQR_MANUAL_GRACE_MIN = Number(process.env.KHQR_MANUAL_GRACE_MIN) || 12 * 60; // how long a flagged order keeps its stock
const KHQR_MANUAL_MAX_AGE_MS = 48 * 60 * 60 * 1000;                                // absolute limit, then it expires anyway

async function notifyManualReview(o, reason) {
    try {
        const admins = await pool.query("SELECT chat_id FROM admins WHERE chat_id IS NOT NULL");
        if (admins.rows.length === 0) return;
        const customer = typeof o.customer === 'string' ? JSON.parse(o.customer) : (o.customer || {});
        const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || {});
        let lines = [];
        for (const k in items) lines.push(`- ${items[k].ref} (${items[k].size}) x ${items[k].qty}`);
        const msg =
            `⚠️ ត្រូវការបញ្ជាក់ការបង់ប្រាក់ដោយដៃ (Order #${o.id})\n\n` +
            `💵 ទឹកប្រាក់: $${Number(o.pay_amount).toFixed(2)} (KHQR Bakong)\n` +
            `🧾 Bill number: OD${o.id}\n` +
            `👤 ${customer.name || customer.fullName || '-'} | ${customer.phone || customer.phoneNumber || '-'}\n` +
            (mapInfo(customer) ? `🗺 ${mapInfo(customer).url}\n` : '') +
            (lines.length ? `🛒 ទំនិញ:\n${lines.join('\n')}\n` : '') +
            `\nមូលហេតុ: ${reason}\n\n` +
            `សូមបើកកម្មវិធី Bakong/ធនាគាររបស់អ្នក ពិនិត្យថាបានទទួលប្រាក់ពិតមែនឬអត់ មុនចុចប៊ូតុង។`;
        const kb = { inline_keyboard: [[
            { text: '✅ បានទទួលប្រាក់ (Paid)', callback_data: `manual_paid_${o.id}` },
            { text: '❌ មិនបានទទួល (Cancel)', callback_data: `manual_cancel_${o.id}` }
        ]] };
        for (const adm of admins.rows) {
            try { await bot.telegram.sendMessage(adm.chat_id, msg, { reply_markup: kb }); } catch (e) {}
        }
    } catch (err) {
        console.error('notifyManualReview error:', err.message);
    }
}

// Flag an awaiting order for manual review (once) and tell the admins. Returns true if this call flagged it.
async function flagManualReview(o, reason) {
    const r = await pool.query(
        "UPDATE orders SET manual_review = TRUE, expires_at = NOW() + make_interval(mins => $2::int) WHERE id = $1 AND status = 'AWAITING_PAYMENT' AND manual_review IS NOT TRUE RETURNING *",
        [o.id, KHQR_MANUAL_GRACE_MIN]
    );
    if (r.rows.length === 0) return false;
    console.log(`Order ${o.id} flagged for manual payment review: ${reason}`);
    await notifyManualReview(r.rows[0], reason);
    return true;
}

// An awaiting order reached its deadline: one last check, then decide. Never expires on QUOTA/ERROR.
// returns 'PAID' | 'EXPIRED' | 'MANUAL'
async function settleExpired(o) {
    const c = await checkOrderPaid(o, 'final');
    if (c.state === 'PAID') { await markOrderPaid(o.id); return 'PAID'; }
    if (c.state === 'UNPAID') { await expireOrder(o.id); return 'EXPIRED'; }

    // QUOTA / ERROR: the answer is unknown
    const ageMs = o.created_at ? Date.now() - new Date(o.created_at).getTime() : 0;
    if (o.manual_review) {
        if (ageMs > KHQR_MANUAL_MAX_AGE_MS) { await expireOrder(o.id); return 'EXPIRED'; }
        await pool.query("UPDATE orders SET expires_at = NOW() + interval '30 minutes' WHERE id = $1 AND status = 'AWAITING_PAYMENT'", [o.id]); // retry later
        return 'MANUAL';
    }
    await flagManualReview(o, c.state === 'QUOTA' ? 'Bakong ប្រើកូតាហៅ API អស់ហើយសម្រាប់ថ្ងៃនេះ' : `ពិនិត្យស្វ័យប្រវត្តិមិនបាន (${c.detail || 'error'})`);
    return 'MANUAL';
}

// ---- Standalone QR generator: completely separate from orders, stock and the database ----------
// /qr shows a small page; POST /api/qr/generate builds a KHQR locally (no Bakong API call, nothing saved).
const standaloneQrRate = new Map(); // ip -> [timestamps]
app.get('/qr', (req, res) => res.sendFile(path.join(__dirname, 'qr.html')));
app.post('/api/qr/generate', (req, res) => {
    try {
        if (!bakong.isEnabled()) return res.status(503).json({ ok: false, message: 'KHQR is not configured' });
        const now = Date.now();
        const ip = req.ip || 'x';
        const recent = (standaloneQrRate.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
        if (recent.length >= 20) return res.status(429).json({ ok: false, message: 'Too many requests, try again later' });
        recent.push(now);
        standaloneQrRate.set(ip, recent);

        const { amount, note, days, minutes } = req.body || {};
        const a = Number(amount);
        if (amount !== undefined && amount !== null && amount !== '' && (!Number.isFinite(a) || a < 0 || a > 10000)) {
            return res.status(400).json({ ok: false, message: 'Invalid amount' });
        }
        res.json({ ok: true, ...bakong.createStandaloneKhqr({ amount: a || 0, note, days, minutes }) });
    } catch (err) {
        console.error('standalone qr error:', err.message);
        res.status(500).json({ ok: false, message: 'Could not generate QR' });
    }
});

// ---- Browser status endpoint (costs ZERO Bakong calls for KHQR) ----------------------------------
// The browser polls this every few seconds, but it only reads the database. The Bakong calls are made by the
// central poller below, shared by every customer, and only as often as the budget allows.
const khqrLastSeen = new Map();    // md5 -> last time a browser asked about it
const khqrLastChecked = new Map(); // md5 -> last time we asked the payment provider about it

app.get('/api/payment-status/:md5', async (req, res) => {
    try {
        const md5 = String(req.params.md5).toLowerCase();
        if (!/^[a-f0-9]{32}$/.test(md5)) return res.status(400).json({ status: 'INVALID' });

        const r = await pool.query("SELECT id, status, pay_amount, expires_at, payment_method, khqr_md5, manual_review, created_at FROM orders WHERE khqr_md5 = $1", [md5]);
        if (r.rows.length === 0) return res.status(404).json({ status: 'NOT_FOUND' });
        const o = r.rows[0];

        if (o.status === 'AWAITING_PAYMENT') {
            khqrLastSeen.set(md5, Date.now());

            if (new Date(o.expires_at) <= new Date()) {
                const out = await settleExpired(o);
                if (out === 'PAID') return res.json({ status: 'PAID', order_id: o.id });
                if (out === 'EXPIRED') return res.json({ status: 'EXPIRED' });
                return res.json({ status: 'WAITING', manual: true, degraded: true });
            }

            const now = Date.now();
            const sinceLast = now - (khqrLastChecked.get(md5) || 0);
            if (req.query.force === '1' && !o.manual_review && sinceLast >= 8000) {
                // the customer pressed "I have paid - check again": one extra check (may use the reserve), 8 s cooldown per order
                khqrLastChecked.set(md5, now);
                const c = await checkOrderPaid(o, 'manual');
                if (c.state === 'PAID') { await markOrderPaid(o.id); return res.json({ status: 'PAID', order_id: o.id }); }
                if (c.state !== 'UNPAID') console.error(`KHQR manual check (order ${o.id}): ${c.state} ${c.detail || ''}`);
            }
            return res.json({ status: 'WAITING', manual: !!o.manual_review, degraded: bakong.degraded() });
        }
        // PENDING/CONFIRMED with paid_at = paid; anything else = expired or cancelled
        if (o.status === 'PENDING' || o.status === 'CONFIRMED') return res.json({ status: 'PAID', order_id: o.id });
        return res.json({ status: 'EXPIRED' });
    } catch (err) {
        console.error('payment-status error:', err);
        res.status(500).json({ status: 'ERROR' });
    }
});

// Customer says "I paid" while the automatic check cannot confirm it -> flag the order and ping the admins.
app.post('/api/payment-claim/:md5', async (req, res) => {
    try {
        const md5 = String(req.params.md5).toLowerCase();
        if (!/^[a-f0-9]{32}$/.test(md5)) return res.status(400).json({ ok: false });
        const r = await pool.query("SELECT * FROM orders WHERE khqr_md5 = $1 AND status = 'AWAITING_PAYMENT'", [md5]);
        if (r.rows.length === 0) return res.json({ ok: false });
        await flagManualReview(r.rows[0], 'អតិថិជនចុច "ខ្ញុំបានបង់រួចហើយ" ប៉ុន្តែប្រព័ន្ធមិនទាន់អាចបញ្ជាក់បាន');
        res.json({ ok: true }); // already flagged = still ok, the admins have the message
    } catch (err) {
        console.error('payment-claim error:', err);
        res.status(500).json({ ok: false });
    }
});

// ---- Central Bakong poller ------------------------------------------------------------------------
// ONE batched Bakong call covers every waiting order. Nothing is called when nobody is waiting.
// Schedule per order (age = time since the QR was made); orders whose page is no longer open are checked rarely.
// Nobody can scan + confirm in the first seconds, so the first check waits KHQR_FIRST_CHECK_MS. After that the
// pace is tuned for a 3-minute QR: most customers pay in 20-60 s, so we check a bit more often early on and
// slow down later. When the customer comes back from the bank app the browser asks for an immediate check
// anyway (see ?force=1 below), so the success screen does not depend on this schedule.
const KHQR_FIRST_CHECK_MS = 12000;
function khqrPollInterval(ageMs, seen) {
    if (!seen) return 60000;          // page closed / phone locked: rarely; the deadline check settles it
    if (ageMs < 90000) return 12000;  // 12 s - 90 s
    return 20000;                     // 90 s - expiry
}
let khqrPolling = false;
setInterval(async () => {
    if (khqrPolling || !bakong.isEnabled()) return;
    khqrPolling = true;
    try {
        const r = await pool.query(
            "SELECT id, khqr_md5, pay_amount, expires_at FROM orders WHERE status = 'AWAITING_PAYMENT' AND payment_method = 'KHQR' AND khqr_md5 IS NOT NULL AND manual_review IS NOT TRUE AND expires_at > NOW()"
        );
        const now = Date.now();
        for (const [k, t] of khqrLastSeen) if (now - t > 3600000) khqrLastSeen.delete(k);
        for (const [k, t] of khqrLastChecked) if (now - t > 3600000) khqrLastChecked.delete(k);
        if (r.rows.length === 0) return;

        const due = r.rows.some(o => {
            const age = KHQR_EXPIRE_MINUTES * 60000 - (new Date(o.expires_at).getTime() - now);
            const seen = now - (khqrLastSeen.get(o.khqr_md5) || 0) < 60000;
            if (age < KHQR_FIRST_CHECK_MS) return false;
            return now - (khqrLastChecked.get(o.khqr_md5) || 0) >= khqrPollInterval(age, seen);
        });
        if (!due) return;
        if (!bakong.allow('auto')) return; // out of (non-reserved) calls: wait for manual review instead of hammering the API

        r.rows.forEach(o => khqrLastChecked.set(o.khqr_md5, now));
        const results = await bakong.checkPaidBatch(r.rows.map(o => ({ md5: o.khqr_md5, amount: o.pay_amount })), 'auto');
        const st = bakong.status();
        for (const o of r.rows) {
            const c = results.get(o.khqr_md5);
            if (!c) continue;
            if (c.state === 'PAID') await markOrderPaid(o.id);
            else if (c.state === 'QUOTA') console.error(`Bakong quota reached (${st.used}/${st.limit} today). Waiting orders will go to manual review.`);
            else if (c.state === 'ERROR') console.error(`KHQR check error (order ${o.id}):`, c.detail);
        }
    } catch (err) {
        console.error('khqr poller error:', err.message);
    } finally {
        khqrPolling = false;
    }
}, 5000);

// Safety net: every minute, settle orders past their deadline (last check, then PAID / EXPIRED / manual review).
setInterval(async () => {
    try {
        const r = await pool.query("SELECT id, customer, items, khqr_md5, pay_amount, payment_method, manual_review, created_at FROM orders WHERE status = 'AWAITING_PAYMENT' AND expires_at <= NOW()");
        for (const o of r.rows) await settleExpired(o);
    } catch (err) {
        console.error('expire sweeper error:', err.message);
    }
}, 60 * 1000);

const MAX_QTY_PER_LINE = 20;
const MAX_ORDER_LINES = 30;

app.post('/api/order', async (req, res) => {
    const body = req.body || {};
    let { customer, items, payment_method } = body;
    const isKhqr = payment_method === 'khqr'; // "pay online" (Bakong KHQR)
    const isWallet = payment_method === 'wallet'; // pay from the customer's Wallet balance

    // ---- validate input (never trust the browser) ----
    if (ipLimited('order:' + req.ip, 15, 10 * 60 * 1000)) return res.status(429).json({ success: false, message: 'ព្យាយាមច្រើនពេក សូមរង់ចាំបន្តិចសិន។' });
    // 👤 when accounts are ON, only a logged-in customer can order
    const authCust = await customers.authCustomer(req);
    if (customers.enabled && !authCust) return res.status(401).json({ success: false, need_login: true, message: 'សូម Login ជាមុនសិន។' });
    if (isWallet && !authCust) return res.status(401).json({ success: false, need_login: true, message: 'Please log in' });
    if (!items || typeof items !== 'object') return res.status(400).json({ success: false, message: 'Invalid order' });
    if (!customer || typeof customer !== 'object' || Array.isArray(customer)) customer = {};
    const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    customer = {
        name: cut(customer.name || customer.fullName, 100),
        phone: cut(customer.phone || customer.phoneNumber, 30),
        address: cut(customer.address || customer.location, 500),
        mapUrl: cut(customer.mapUrl || customer.map, 60),
        userId: cleanTgId(customer.userId || customer.telegramId),
        username: cleanTgUsername(customer.username)
    };
    if (authCust) { if (!customer.name) customer.name = authCust.name || ''; if (!customer.phone && authCust.phone) customer.phone = '0' + String(authCust.phone).replace(/^855/, ''); }

    // merge duplicate lines (same ref + size) so stock is checked against the TOTAL quantity
    const lines = new Map();
    const rawItems = Array.isArray(items) ? items : Object.values(items);
    if (rawItems.length === 0 || rawItems.length > MAX_ORDER_LINES) return res.status(400).json({ success: false, message: 'Invalid order' });
    for (const item of rawItems) {
        if (!item || typeof item.ref !== 'string' || typeof item.size !== 'string') return res.status(400).json({ success: false, message: 'Invalid order' });
        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) return res.status(400).json({ success: false, message: 'ចំនួនមិនត្រឹមត្រូវ!' });
        const cleanRef = item.ref.replace(/ref:?\s*/i, '').trim().toUpperCase();
        const cleanSize = item.size.trim().toUpperCase();
        if (!cleanRef || !cleanSize) return res.status(400).json({ success: false, message: 'Invalid order' });
        const k = cleanRef + '\u0000' + cleanSize;
        const prev = lines.get(k);
        if (prev) prev.qty += qty; else lines.set(k, { ref: cleanRef, size: cleanSize, qty });
    }

    if (isKhqr) {
        if (!bakong.isEnabled()) return res.json({ success: false, message: 'This payment method is not available right now.' });
        if (khqrRateLimited(req.ip)) return res.status(429).json({ success: false, message: 'ព្យាយាមច្រើនពេក សូមរង់ចាំបន្តិចសិន។' });
    }

    const client = await pool.connect();
    let released = false;
    const release = () => { if (!released) { released = true; client.release(); } };
    let committed = false;
    let orderId, itemsSummary = [], totalAmount = 0, payAmount = 0, expiresAt = null, khqrResult = null, walletBalance = null;

    try {
        await client.query('BEGIN');

        for (const line of lines.values()) {
            // FOR UPDATE locks the row until COMMIT; lines are unique so stock can never be oversold
            const check = await client.query(
                "SELECT s.stock_qty, p.title_km, p.price, p.cost_price FROM stock s JOIN products p ON s.ref = p.ref WHERE UPPER(s.ref) = $1 AND UPPER(s.size) = $2 FOR UPDATE OF s",
                [line.ref, line.size]
            );
            if (check.rows.length === 0) {
                await client.query('ROLLBACK'); release();
                return res.json({ success: false, message: `រកមិនឃើញទំនិញ Ref ${line.ref} Size ${line.size} ឡើយ!` });
            }
            if (check.rows[0].stock_qty < line.qty) {
                await client.query('ROLLBACK'); release();
                return res.json({ success: false, message: `សូមអភ័យទោស! ទំនិញ Ref ${line.ref} Size ${line.size} ដាច់ស្តុក!` });
            }
            const sellPrice = parseFloat(check.rows[0].price);
            const costPrice = parseFloat(check.rows[0].cost_price || 0);
            if (!(sellPrice >= 0)) throw new Error('bad price for ' + line.ref);
            const itemTotal = sellPrice * line.qty;
            totalAmount += itemTotal;
            itemsSummary.push({
                ref: line.ref, title: check.rows[0].title_km, size: line.size, qty: line.qty,
                price: sellPrice, cost_price: costPrice, total: itemTotal, profit: (sellPrice - costPrice) * line.qty
            });
        }

        // For KHQR the customer pays items + delivery fee; the amount is always computed here, never trusted from the browser.
        if (isKhqr) {
            payAmount = Number((totalAmount + await getDeliveryFeeNumber()).toFixed(2));
            if (!(payAmount > 0)) {
                await client.query('ROLLBACK'); release();
                return res.json({ success: false, message: 'ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ!' });
            }
            expiresAt = new Date(Date.now() + KHQR_EXPIRE_MINUTES * 60 * 1000);
        }

        if (isWallet) payAmount = Number((totalAmount + await getDeliveryFeeNumber()).toFixed(2)); // items + delivery, computed here

        const orderRes = await client.query(
            `INSERT INTO orders (customer, items, total, status, payment_method, pay_amount, expires_at, customer_id, paid_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [JSON.stringify(customer), JSON.stringify(itemsSummary), totalAmount,
             isKhqr ? 'AWAITING_PAYMENT' : 'PENDING', isKhqr ? 'KHQR' : (isWallet ? 'WALLET' : 'COD'), (isKhqr || isWallet) ? payAmount : null, expiresAt, authCust ? authCust.id : null, isWallet ? new Date() : null]
        );
        orderId = orderRes.rows[0].id;

        if (isWallet) {
            // balance check + deduction in the SAME transaction as the stock: any failure rolls everything back
            walletBalance = await wallet.spend(client, authCust.id, payAmount, 'order:' + orderId);
            if (walletBalance === null) {
                await client.query('ROLLBACK'); release();
                return res.json({ success: false, insufficient: true, message: 'Wallet balance is not enough. Please top up first.' });
            }
        }

        if (isKhqr) {
            // If QR generation throws, the catch below rolls back the order AND the stock deduction.
            khqrResult = bakong.createKhqr({ amount: payAmount, billNumber: `OD${orderId}`, expiresAt: expiresAt.getTime() });
            await client.query("UPDATE orders SET khqr_md5 = $1 WHERE id = $2", [khqrResult.md5, orderId]);
        }

        for (const line of lines.values()) {
            const u = await client.query(
                "UPDATE stock SET stock_qty = stock_qty - $1 WHERE UPPER(ref) = $2 AND UPPER(size) = $3 AND stock_qty >= $1",
                [line.qty, line.ref, line.size]
            );
            if (u.rowCount !== 1) throw new Error('stock changed during checkout');
        }

        await client.query('COMMIT');
        committed = true;
        release();
    } catch (err) {
        if (!committed) { try { await client.query('ROLLBACK'); } catch (e) {} }
        release();
        console.error('order error:', err);
        return res.status(500).json({
            success: false,
            message: isKhqr ? 'មិនអាចបង្កើតការបង់ប្រាក់បានទេ សូមសាកល្បងម្តងទៀត ឬជ្រើសវិធីបង់ប្រាក់ផ្សេង។' : 'មានបញ្ហា សូមសាកល្បងម្តងទៀត។'
        });
    }

    // The order is saved. From here on nothing may turn the answer into an error (the customer would re-order).
    if (isWallet) {
        try { await sendOrderToAdmins(orderId, customer, itemsSummary, payAmount, ` Paid by WALLET $${payAmount.toFixed(2)}`); }
        catch (e) { console.error('notify admins failed:', e.message); }
        return res.json({ success: true, payment: 'wallet', order_id: orderId, amount: payAmount, balance: walletBalance });
    }
    if (!isKhqr) {
        try { await sendOrderToAdmins(orderId, customer, itemsSummary, totalAmount, ''); }
        catch (e) { console.error('notify admins failed:', e.message); }
        return res.json({ success: true, message: "ការកុម្មង់បានជោគជ័យ និងកាត់ស្តុកស្វ័យប្រវត្តិរួចរាល់!" });
    }
    // KHQR orders notify the admins only after the money arrives (markOrderPaid)
    return res.json({
        success: true,
        payment: 'khqr',
        order_id: orderId,
        qr: khqrResult.qr,
        md5: khqrResult.md5,
        amount: payAmount,
        expires_at: expiresAt.getTime()
    });
});

// --- TELEGRAM BOT COMMANDS & CALLBACKS ---

bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    let authorized = await isAdminUser(chatId, username);
    if (authorized) {
        if (username) {
            await pool.query("UPDATE admins SET chat_id = $1 WHERE chat_id < 0 AND LOWER(username) = LOWER($2) AND NOT EXISTS (SELECT 1 FROM admins WHERE chat_id = $1)", [chatId, username]);
        }
        return ctx.reply('👋 សួស្តី Admin! ប្រព័ន្ធគ្រប់គ្រងស្តុក OneDay Clothing ដំណើរការធម្មតា (Cloudinary Connected)។');
    }

    userStates[chatId] = { action: 'WAITING_PASSWORD' };
    ctx.reply('🔐 សូមបញ្ចូល Password ដើម្បីចូលប្រើប្រាស់ប្រព័ន្ធ៖');
});

bot.command('stats', async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️️ គ្មានសិទ្ធិ!');

    try {
        let prodCount = await pool.query("SELECT COUNT(*) FROM products");
        let stockSum = await pool.query("SELECT SUM(stock_qty) FROM stock");
        let orderPending = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'PENDING'");
        let totalSales = await pool.query("SELECT SUM(total) FROM orders WHERE status = 'CONFIRMED'");

        let msg = `📊 **របាយការណ៍ និងស្ថិតិសរុប Oneday Clothing**\n\n`;
        msg += `📦 ផលិតផលសរុប: **${prodCount.rows[0].count} Ref**\n`;
        msg += `👕 គ្រឿងស្តុកសរុប: **${stockSum.rows[0].sum || 0} គ្រឿង**\n`;
        msg += `⏳ Order កំពុងរង់ចាំ (Pending): **${orderPending.rows[0].count}**\n`;
        msg += `💵 ជោគជ័យសរុប (Confirmed Sales): **$${parseFloat(totalSales.rows[0].sum || 0).toFixed(2)}**`;

        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.command('orders', async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

    try {
        let res = await pool.query("SELECT * FROM orders WHERE status = 'PENDING' ORDER BY id DESC LIMIT 5");
        if (res.rows.length === 0) return ctx.reply('✅ គ្មាន Order ថ្មីកំពុងរង់ចាំ (Pending) ទេ!');

        for (let order of res.rows) {
            let cust = typeof order.customer === 'string' ? JSON.parse(order.customer) : order.customer;
            let items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

            let msg = `📦 **Order ID: #${order.id}** (Status: PENDING)\n`;
            msg += `👤 ឈ្មោះ: ${escMd(cust?.name || 'អនាមិក')} (${escMd(cust?.phone || 'គ្មានលេខ')})\n`;
            msg += `📍 អាសយដ្ឋាន: ${escMd(cust?.address || 'គ្មាន')}\n`;
            { const mi = mapInfo(cust); if (mi) msg += `🗺 ${mi.url}\n`; }
            msg += `🛒 ទំនិញ:\n`;
            for (let key in items) {
                let it = items[key];
                msg += `• Ref ${escMd(it.ref)} (Size ${escMd(it.size)}) x ${it.qty} = $${Number(it.price * it.qty).toFixed(2)}\n`;
            }
            msg += `💵 សរុប: $${Number(order.total).toFixed(2)}`;

            let inlineKeyboard = [
                [
                    { text: '✅ Confirm Order', callback_data: `confirm_order_${order.id}` },
                    { text: '❌ Cancel Order', callback_data: `cancel_order_${order.id}` }
                ]
            ];

            { const mi2 = mapInfo(cust); if (mi2) inlineKeyboard.push([{ text: "📍 បើក Map", url: mi2.url }]); }
            await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } });
        }
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.hears(/^\/search\s+(.+)/i, async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

    let rawRef = ctx.match[1].trim();
    let cleanRef = rawRef.replace(/ref:?\s*/i, '').trim().toUpperCase();

    try {
        let check = await pool.query("SELECT * FROM products WHERE UPPER(ref) = $1", [cleanRef]);
        if (check.rows.length === 0) return ctx.reply(`❌ រកមិនឃើញទំនិញ Ref ${cleanRef} ឡើយ!`);
        let prod = check.rows[0];

        let stockRes = await pool.query("SELECT size, stock_qty FROM stock WHERE UPPER(ref) = $1 ORDER BY size", [cleanRef]);
        let stockText = stockRes.rows.map(s => `${s.size}: ${s.stock_qty}`).join(' | ');

        let msg = `🔍 **ព័ត៌មានទំនិញ Ref : ${cleanRef}**\n\n`;
        msg += `• ឈ្មោះ: ${escMd(prod.title_km)}\n`;
        msg += `• តម្លៃ: $${prod.price}\n`;
        msg += `• ភេទ: ${prod.gender}\n`;
        msg += `• ប្រភេទ: ${prod.type}\n`;
        msg += `• មាន 3D: ${prod.model_3d_url ? '✅ មាន' : '❌ គ្មាន'}\n`;
        msg += `• ស្តុក: [ ${stockText} ]\n`;
        if (prod.desc_km) msg += `• ការបរិយាយ: ${escMd(prod.desc_km)}\n`;

        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.command(['delivery', 'Delivery'], async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

    userStates[chatId] = { action: 'WEBSITE', step: 'WAITING_DELIVERY_FEE' };
    
    await ctx.reply('🚚 **កំណត់ថ្លៃដឹកជញ្ជូន (Delivery Fee)**\n\nសូមផ្ញើសារតម្លៃថ្មី (ឧ. `2.00`) ឬវាយពាក្យថា **តម្លៃដឹកទូទាត់ជាមួយហាង**៖', {
        parse_mode: 'Markdown'
    });
});

bot.command(['website', 'Website'], async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

    userStates[chatId] = { action: 'WEBSITE' };

    await ctx.reply('🌐 **កំណត់រចនាប័ទ្ម Website (Website Settings)**\n\nសូមជ្រើសរើសផ្នែកដែលបងចង់ធ្វើការ៖', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '👁️ មើលការកំណត់បច្ចុប្បន្ន', callback_data: 'web_view_settings' }],
                [{ text: '🎬 🖼️ កែប្រែ Cover Slider (Add/Delete)', callback_data: 'web_edit_cover' }],
                [{ text: '🎨 កែប្រែ Logo ហាង & Cart Icon', callback_data: 'web_edit_icon' }],
                [{ text: '📢 កែប្រែសារ Banner (Main Title)', callback_data: 'web_edit_title' }],
                [{ text: '🚚 កែប្រែថ្លៃដឹក (Delivery Fee)', callback_data: 'web_edit_delivery' }],
                [{ text: '❌ បោះបង់ (Cancel)', callback_data: 'web_cancel' }]
            ]
        }
    });
});

bot.action('web_view_settings', async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    try {
        let res = await pool.query("SELECT * FROM website_settings");
        let settings = {};
        res.rows.forEach(r => settings[r.key] = r.value);

        let coversRes = await pool.query("SELECT COUNT(*) FROM website_covers");
        let totalCovers = coversRes.rows[0].count;

        let logoUrl = settings.logo_url || 'Default Logo Text (Oneday.)';
        let cartIconUrl = settings.cart_icon_url || 'Default Cart Icon';
        let mainTitle = settings.cover_title || 'BUILD YOUR DREAM STYLE';
        let deliveryFee = settings.delivery_fee || '2.00';

        let msg = `👁️ **ការកំណត់បច្ចុប្បន្នលើ Website:**\n\n`;
        msg += `📢 **Banner Title:** ${mainTitle}\n`;
        msg += `🚚 **Delivery Fee:** ${isNaN(deliveryFee) ? deliveryFee : '$' + parseFloat(deliveryFee).toFixed(2)}\n`;
        msg += `🎬/🖼️ **Total Covers in Slider:** ${totalCovers} ហ្វាល\n\n`;
        msg += `🖼️ **Shop Logo:**\n${logoUrl}\n\n`;
        msg += `🛒 **Cart Icon:**\n${cartIconUrl}`;

        await ctx.editMessageText(msg, {
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ត្រឡប់ក្រោយ', callback_data: 'web_back_menu' }]
                ]
            }
        });
    } catch (err) {
        await ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.action('web_back_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🌐 **កំណត់រចនាប័ទ្ម Website (Website Settings)**\n\nសូមជ្រើសរើសផ្នែកដែលបងចង់ធ្វើការ៖', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '👁️ មើលការកំណត់បច្ចុប្បន្ន', callback_data: 'web_view_settings' }],
                [{ text: '🎬 🖼️ កែប្រែ Cover Slider (Add/Delete)', callback_data: 'web_edit_cover' }],
                [{ text: '🎨 កែប្រែ Logo ហាង & Cart Icon', callback_data: 'web_edit_icon' }],
                [{ text: '📢 កែប្រែសារ Banner (Main Title)', callback_data: 'web_edit_title' }],
                [{ text: '🚚 កែប្រែថ្លៃដឹក (Delivery Fee)', callback_data: 'web_edit_delivery' }],
                [{ text: '❌ បោះបង់ (Cancel)', callback_data: 'web_cancel' }]
            ]
        }
    });
});

bot.action('web_edit_cover', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await ctx.editMessageText('🎬/🖼️ **តើបងចង់ធ្វើអ្វីជាមួយ Cover Slider?**', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ បន្ថែម Cover ថ្មី (Add Cover)', callback_data: 'web_cover_add' }],
                    [{ text: '🗑 លុប Cover តាមលេខរៀង (Delete Cover)', callback_data: 'web_cover_delete_list' }],
                    [{ text: '🔥 លុប Cover ចាស់ៗទាំងអស់ (Delete All)', callback_data: 'web_cover_delete_all' }],
                    [{ text: '🔙 ត្រឡប់ក្រោយ', callback_data: 'web_back_menu' }]
                ]
            }
        });
    } catch (err) {
        console.error("Error in web_edit_cover:", err);
    }
});

bot.action('web_cover_add', async (ctx) => {
    const chatId = ctx.chat.id;
    userStates[chatId] = { action: 'WEBSITE', step: 'WAITING_ADD_COVER' };
    try {
        await ctx.answerCbQuery();
        await ctx.editMessageText('🎬/🖼️ **សូម Upload រូបភាព (Image) ឬ Video** សម្រាប់បន្ថែមចូលទៅក្នុង Cover Slider៖');
    } catch (err) {
        console.error("Error in web_cover_add:", err);
    }
});

bot.action('web_cover_delete_list', async (ctx) => {
    try {
        let res = await pool.query("SELECT * FROM website_covers ORDER BY id ASC");
        if (res.rows.length === 0) {
            return ctx.answerCbQuery('⚠️ មិនមាន Cover ក្នុង Slider សម្រាប់លុបទេ!', { show_alert: true });
        }
        let inlineKeyboard = [];
        res.rows.forEach((cov, idx) => {
            inlineKeyboard.push([{ text: `🗑️ លុប Cover ទី ${idx + 1} (ID: ${cov.id})`, callback_data: `del_cover_${cov.id}` }]);
        });
        inlineKeyboard.push([{ text: '🔙 ត្រឡប់ក្រោយ', callback_data: 'web_edit_cover' }]);

        await ctx.answerCbQuery();
        await ctx.editMessageText('🗑️ **សូមជ្រើសរើស Cover ដែលអ្នកចង់លុប៖**', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard }
        });
    } catch (err) {
        console.error("Error in web_cover_delete_list:", err);
        await ctx.answerCbQuery('❌ មានបញ្ហាទាញយកទិន្នន័យ', { show_alert: true });
    }
});

bot.action('web_cover_delete_all', async (ctx) => {
    try {
        let res = await pool.query("SELECT cover_url FROM website_covers");
        for (let row of res.rows) {
            await deleteCloudinaryFileByUrl(row.cover_url);
        }
        await pool.query("DELETE FROM website_covers");
        await ctx.answerCbQuery('✅ បានលុប Cover ទាំងអស់ចោលជោគជ័យ!');
        await ctx.editMessageText('✅ **បានសម្អាត និងលុប Cover ទាំងអស់ចោលរួចរាល់ហើយ!**', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 ត្រឡប់ក្រោយ', callback_data: 'web_edit_cover' }]]
            }
        });
    } catch (err) {
        console.error("Error deleting all covers:", err);
        await ctx.answerCbQuery('❌ មានបញ្ហាពេលលុប Cover ទាំងអស់', { show_alert: true });
    }
});

bot.action(/^del_cover_(\d+)$/, async (ctx) => {
    let coverId = ctx.match[1];
    try {
        let res = await pool.query("SELECT cover_url FROM website_covers WHERE id = $1", [coverId]);
        if (res.rows.length > 0) {
            let coverUrl = res.rows[0].cover_url;
            await pool.query("DELETE FROM website_covers WHERE id = $1", [coverId]);
            await deleteCloudinaryFileByUrl(coverUrl);
        }

        await ctx.answerCbQuery('✅ បានលុប Cover ជោគជ័យ!');
        await ctx.editMessageText('✅ បានលុប Cover រួចរាល់!', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 ត្រឡប់ក្រោយ', callback_data: 'web_edit_cover' }]]
            }
        });
    } catch (err) {
        console.error("Error deleting cover ID:", coverId, err);
        await ctx.answerCbQuery('❌ មានបញ្ហាពេលលុប', { show_alert: true });
    }
});

bot.action('web_edit_icon', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🎨 **ជ្រើសរើស Icon ឬ Logo ដែលចង់កែប្រែ៖**', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🖼️ រូប Logo ហាង (Header Logo)', callback_data: 'web_set_icon_logo' }],
                [{ text: '🛒 រូប Cart Icon', callback_data: 'web_set_icon_cart' }]
            ]
        }
    });
});

bot.action(/^web_set_icon_(logo|cart)$/, async (ctx) => {
    let type = ctx.match[1];
    const chatId = ctx.chat.id;
    userStates[chatId] = { action: 'WEBSITE', step: `WAITING_ICON_${type.toUpperCase()}` };
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🖼️ សូម Upload រូបភាព (Image/PNG) ថ្មីសម្រាប់ **${type.toUpperCase()}**:`);
});

bot.action('web_edit_title', async (ctx) => {
    const chatId = ctx.chat.id;
    userStates[chatId] = { action: 'WEBSITE', step: 'WAITING_TITLE' };
    await ctx.answerCbQuery();
    await ctx.editMessageText('📢 **សូមផ្ញើសារ/អក្សរ Banner ថ្មី** (ឧ. SPECIAL OFFER 20% OFF)៖');
});

bot.action('web_edit_delivery', async (ctx) => {
    const chatId = ctx.chat.id;
    userStates[chatId] = { action: 'WEBSITE', step: 'WAITING_DELIVERY_FEE' };
    await ctx.answerCbQuery();
    await ctx.editMessageText('🚚 **កំណត់ថ្លៃដឹកជញ្ជូន (Delivery Fee)**\n\nសូមផ្ញើសារតម្លៃថ្មី (ឧ. `2.00`) ឬវាយពាក្យថា **តម្លៃដឹកទូទាត់ជាមួយហាង**៖', { parse_mode: 'Markdown' });
});

bot.action('web_cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    delete userStates[chatId];
    await ctx.answerCbQuery('❌ បានបោះបង់');
    await ctx.editMessageText('❌ បានលុបចោលដំណើរការកំណត់ Website រួចរាល់。');
});

bot.command('setmeowner', async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    try {
        let checkOwner = await pool.query("SELECT * FROM admins WHERE is_owner = TRUE");
        if (checkOwner.rows.length > 0) return ctx.reply('⛔️ ប្រព័ន្ធមាន Owner ផ្លូវការរួចរាល់ហើយ!');
        // Only an existing admin, or the Telegram id in OWNER_CHAT_ID, may claim ownership (was: any stranger).
        const envOwner = String(process.env.OWNER_CHAT_ID || '');
        if (!(envOwner && envOwner === String(chatId)) && !(await isAdminUser(chatId, username))) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

        await pool.query(
            "INSERT INTO admins (chat_id, username, is_owner) VALUES ($1, $2, TRUE) ON CONFLICT (chat_id) DO UPDATE SET is_owner = TRUE, username = $2",
            [chatId, username]
        );
        ctx.reply('👑 ជោគជ័យ! Account របស់បងត្រូវបានកំណត់ជា Owner ផ្លូវការហើយ។');
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.command('checkadmin', async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isOwnerUser(chatId, username)) return ctx.reply('⛔️ មានតែ Owner ទេដែលអាចប្រើប្រាស់មុខងារនេះបាន!');

    try {
        let ownerRes = await pool.query("SELECT username, chat_id FROM admins WHERE is_owner = TRUE");
        let adminsRes = await pool.query("SELECT username, chat_id FROM admins WHERE is_owner = FALSE OR is_owner IS NULL");

        let ownerText = ownerRes.rows.length > 0 ? (ownerRes.rows[0].username ? `@${ownerRes.rows[0].username}` : `ID: ${ownerRes.rows[0].chat_id}`) : 'មិនទាន់មាន';
        let msg = `👑 **Owner :** ${ownerText}\n\n📋 **បញ្ជី Admin ទាំងអស់:**\nសូមចុចលើឈ្មោះ Admin ខាងក្រោមដើម្បីផ្ទេរ Owner ឫ Kick:`;

        let inlineKeyboard = [];
        adminsRes.rows.forEach(adm => {
            let uName = adm.username ? `@${adm.username}` : `ID: ${adm.chat_id}`;
            let rawUName = adm.username || adm.chat_id.toString();
            inlineKeyboard.push([{ text: `👤 ${uName}`, callback_data: `manage_adm_${rawUName}` }]);
        });

        await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } });
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.action(/^manage_adm_(.+)$/, async (ctx) => {
    const target = ctx.match[1];
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isOwnerUser(chatId, username)) return ctx.answerCbQuery('⛔️ គ្មានសិទ្ធិ!', { show_alert: true });

    await ctx.answerCbQuery();
    await ctx.editMessageText(`⚙️ គ្រប់គ្រង Admin: **@${target}**\nតើអ្នកចង់ធ្វើអ្វីជាមួយ Account នេះ?`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '👑 ផ្ទេរ Owner', callback_data: `transfer_own_${target}` },
                    { text: '❌ Kick Admin', callback_data: `kick_adm_${target}` }
                ]
            ]
        }
    });
});

bot.action(/^transfer_own_(.+)$/, async (ctx) => {
    const target = ctx.match[1];
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isOwnerUser(chatId, username)) return ctx.answerCbQuery('⛔️ គ្មានសិទ្ធិ!', { show_alert: true });

    try {
        const c = await pool.connect();
        try {
            await c.query('BEGIN');
            const t = await c.query("SELECT id FROM admins WHERE LOWER(username) = LOWER($1) OR chat_id::text = $1 LIMIT 1", [target]);
            if (t.rows.length === 0) { await c.query('ROLLBACK'); return ctx.answerCbQuery('❌ រកមិនឃើញ Admin!', { show_alert: true }); }
            await c.query("UPDATE admins SET is_owner = FALSE WHERE is_owner = TRUE");
            await c.query("UPDATE admins SET is_owner = TRUE WHERE id = $1", [t.rows[0].id]);
            await c.query('COMMIT');
        } catch (e) { try { await c.query('ROLLBACK'); } catch (e2) {} throw e; }
        finally { c.release(); }

        await ctx.answerCbQuery('✅ ផ្ទេរ Owner ជោគជ័យ!');
        await ctx.editMessageText(`👑 បានផ្ទេរអំណាចជា Owner ទៅឱ្យ **@${target}** រួចរាល់ហើយ!`, { parse_mode: 'Markdown' });
    } catch (err) {
        await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true });
    }
});

bot.action(/^kick_adm_(.+)$/, async (ctx) => {
    const target = ctx.match[1];
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isOwnerUser(chatId, username)) return ctx.answerCbQuery('⛔️ គ្មានសិទ្ធិ!', { show_alert: true });

    try {
        let adminRec = await pool.query("SELECT chat_id, username, is_owner FROM admins WHERE LOWER(username) = LOWER($1) OR chat_id::text = $1", [target]);
        if (adminRec.rows.length > 0) {
            if (adminRec.rows[0].is_owner) return ctx.answerCbQuery('❌ មិនអាច Kick Owner បានទេ!', { show_alert: true });
            let adm = adminRec.rows[0];
            await pool.query("INSERT INTO banned_admins (chat_id, username) VALUES ($1, $2) ON CONFLICT (chat_id) DO UPDATE SET username = $2", [adm.chat_id, adm.username]);
            await pool.query("DELETE FROM admins WHERE LOWER(username) = LOWER($1) OR chat_id::text = $1", [target]);
        } else {
            await pool.query("INSERT INTO banned_admins (username) VALUES ($1) ON CONFLICT DO NOTHING", [target]);
        }

        await ctx.answerCbQuery('❌ Kick ជោគជ័យ!');
        await ctx.editMessageText(`❌ បាន Kick និង Block **@${target}** រួចរាល់!`, { parse_mode: 'Markdown' });
    } catch (err) {
        await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true });
    }
});

bot.hears(/^\/add\s+@?([a-zA-Z0-9_]{3,32})\s*$/i, async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isOwnerUser(chatId, username)) return ctx.reply('⛔️ មានតែ Owner ទេដែលអាចប្រើប្រាស់មុខងារបន្ថែម Admin បាន!');

    let targetUsername = ctx.match[1].trim();
    try {
        await pool.query("DELETE FROM banned_admins WHERE LOWER(username) = LOWER($1)", [targetUsername]);
        let tempChatId = -Math.floor(Date.now() + Math.random() * 1000);

        let existing = await pool.query("SELECT * FROM admins WHERE LOWER(username) = LOWER($1)", [targetUsername]);
        if (existing.rows.length > 0) {
            await pool.query("UPDATE admins SET is_owner = FALSE WHERE LOWER(username) = LOWER($1)", [targetUsername]);
        } else {
            await pool.query("INSERT INTO admins (chat_id, username, is_owner) VALUES ($1, $2, FALSE)", [tempChatId, targetUsername]);
        }

        ctx.reply(`✅ បានបន្ថែម ឬ Reactivation @${targetUsername} ជា Admin ជោគជ័យ!`);
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.hears(/^\/un\s+@?([a-zA-Z0-9_]{3,32})\s*$/i, async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';

    if (!await isOwnerUser(chatId, username)) return ctx.reply('⛔️ មានតែ Owner ទេដែលអាចប្រើប្រាស់មុខងារដកសិទ្ធិ Admin បាន!');

    let targetUsername = ctx.match[1].trim();
    try {
        let targetCheck = await pool.query("SELECT * FROM admins WHERE LOWER(username) = LOWER($1)", [targetUsername]);
        if (targetCheck.rows.length > 0 && targetCheck.rows[0].is_owner) return ctx.reply('❌ មិនអាចលុបសិទ្ធិរបស់ Owner បានទេ!');

        if (targetCheck.rows.length > 0) {
            let adm = targetCheck.rows[0];
            await pool.query("INSERT INTO banned_admins (chat_id, username) VALUES ($1, $2) ON CONFLICT (chat_id) DO UPDATE SET username = $2", [adm.chat_id, adm.username]);
        } else {
            await pool.query("INSERT INTO banned_admins (username) VALUES ($1) ON CONFLICT DO NOTHING", [targetUsername]);
        }

        await pool.query("DELETE FROM admins WHERE LOWER(username) = LOWER($1)", [targetUsername]);
        ctx.reply(`❌ បានលុបសិទ្ធិ Admin របស់ @${targetUsername} រួចរាល់!`);
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

bot.command('add', async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

    try {
        let prodRes = await pool.query("SELECT ref FROM products");
        let maxRef = 0;
        prodRes.rows.forEach(r => {
            let num = parseInt(r.ref);
            if (!isNaN(num) && num > maxRef) maxRef = num;
        });
        let suggestedRef = String(maxRef + 1);

        userStates[chatId] = { action: 'ADD', step: 'GET_REF' };
        ctx.reply(`📦 **បន្ថែមទំនិញថ្មី**\n\n💡 លេខ Ref ដែលអាចប្រើបានបន្ទាប់គឺ: **${suggestedRef}**\n\nសូមបញ្ចូលលេខ Ref ដែលបងចង់កំណត់ (ឧ. ${suggestedRef} ឬលេខផ្សេងទៀត)៖`, { parse_mode: 'Markdown' });
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
});

const cancelHandler = async (ctx) => {
    const chatId = ctx.chat.id;
    if (userStates[chatId]) {
        delete userStates[chatId];
        ctx.reply('❌ បានលុបចោលដំណើរការរួចរាល់。');
    } else {
        ctx.reply('ℹ️ គ្មានដំណើរការណាកំពុងរត់ទេ។');
    }
};

bot.command('cancel', cancelHandler);
bot.command('cancle', cancelHandler);

bot.command('change', async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');

    const arg = String(ctx.payload || '').replace(/ref:?\s*/i, '').trim().toUpperCase();
    if (arg) return handleEditRefSelection(ctx, chatId, arg);
    userStates[chatId] = { action: 'CHANGE', step: 'GET_REF' };
    ctx.reply('✏️️ សូមសរសេរបញ្ចូលលេខ Ref របស់ទំនិញដែលចង់កែប្រែ:');
});

bot.hears(/^\/change(.+)/i, async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return;

    let rawRef = ctx.match[1].trim();
    let cleanRef = rawRef.replace(/ref:?\s*/i, '').trim().toUpperCase();
    await handleEditRefSelection(ctx, chatId, cleanRef);
});

async function handleEditRefSelection(ctx, chatId, cleanRef) {
    try {
        let check = await pool.query("SELECT * FROM products WHERE UPPER(ref) = $1", [cleanRef]);
        if (check.rows.length === 0) return ctx.reply(`❌ រកមិនឃើញទំនិញ Ref ${cleanRef} ឡើយ!`);
        let prod = check.rows[0];

        userStates[chatId] = { action: 'CHANGE', step: 'SELECT_FIELD', data: { ref: cleanRef } };

        let msg = `⚙️ **កែប្រែទំនិញ Ref : ${cleanRef}**\n• ឈ្មោះ: ${prod.title_km}\n• តម្លៃលក់: $${prod.price}\n\nសូមជ្រើសរើសផ្នែកដែលចង់កែប្រែ៖`;

        await ctx.reply(msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 កែប្រែឈ្មោះ (Title)', callback_data: `edit_f_title_${cleanRef}` }],
                    [{ text: '💵 កែប្រែតម្លៃលក់ (Price)', callback_data: `edit_f_price_${cleanRef}` }],
                    [{ text: '📄 កែប្រែការបរិយាយ (Description)', callback_data: `edit_f_desc_${cleanRef}` }],
                    [{ text: '🎥/🖼️ កែប្រែ Media (Video/Image)', callback_data: `edit_f_video_${cleanRef}` }],
                    [{ text: '🧊 កែប្រែវីដេអូ 3D (3D Model)', callback_data: `edit_f_3d_${cleanRef}` }],
                    [{ text: '🚻 កែប្រែភេទ (Gender)', callback_data: `edit_f_gender_${cleanRef}` }],
                    [{ text: '❌ បោះបង់ (Cancel)', callback_data: 'edit_f_cancel' }]
                ]
            }
        });
    } catch (err) {
        ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }
}

bot.action(/^edit_f_(title|price|desc|video|3d|gender|cancel)_(.+)$/, async (ctx) => {
    let field = ctx.match[1];
    let ref = ctx.match[2];
    let chatId = ctx.chat.id;

    if (field === 'cancel') {
        delete userStates[chatId];
        await ctx.answerCbQuery('❌ បានបោះបង់');
        return ctx.editMessageText('❌ បានលុបចោលដំណើរការរួចរាល់。');
    }

    if (field === 'gender') {
        userStates[chatId] = { action: 'CHANGE', step: 'UPDATE_GENDER', data: { ref } };
        await ctx.answerCbQuery();
        await ctx.editMessageText(`🚻 កែប្រែ Ref ${ref} - ជ្រើសរើសប្រភេទភេទ:`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Men (បុរស)', callback_data: `update_gender_men_${ref}` },
                        { text: 'Women (នារី)', callback_data: `update_gender_women_${ref}` }
                    ]
                ]
            }
        });
        return;
    }

    userStates[chatId] = { action: 'CHANGE', step: `UPDATE_${field.toUpperCase()}`, data: { ref } };
    await ctx.answerCbQuery();
    
    let promptText = '';
    if (field === 'title') promptText = `✏️ សូមសរសេរឈ្មោះទំនិញថ្មីសម្រាប់ Ref ${ref}:`;
    else if (field === 'price') promptText = `💵 សូមសរសេរតម្លៃលក់ថ្មីសម្រាប់ Ref ${ref} (ឧ. 15.00):`;
    else if (field === 'desc') promptText = `📄 សូមសរសេរការបរិយាយថ្មីសម្រាប់ Ref ${ref}:`;
    else if (field === 'video') promptText = `🎥/🖼️ សូម Upload Video ឬ រូបភាព (Image) ថ្មីសម្រាប់ Ref ${ref}:`;
    else if (field === '3d') promptText = `🧊 សូម Upload វីដេអូ 3D ថ្មីសម្រាប់ Ref ${ref} (ឬផ្ញើសារ 'none' ដើម្បីលុបចេញ):`;

    await ctx.editMessageText(promptText);
});

bot.action(/^update_gender_(men|women)_(.+)$/, async (ctx) => {
    let gender = ctx.match[1];
    let ref = ctx.match[2];
    let chatId = ctx.chat.id;

    try {
        await pool.query("UPDATE products SET gender = $1 WHERE UPPER(ref) = $2", [gender, ref]);
        delete userStates[chatId];
        await ctx.answerCbQuery('✅ បានកែប្រែភេទជោគជ័យ!');
        await ctx.editMessageText(`✅ ជោគជ័យ! ទំនិញ Ref ${ref} ត្រូវបានកែប្រែភេទរួចរាល់。`);
    } catch (err) {
        await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true });
    }
});

// 🗑️ មុខងារលុប Ref ជាមួយ Cloudinary Deletion
bot.hears(/^\/deleteref\s+(.+)/i, async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.username || '';
    if (!await isAdminUser(chatId, username)) return ctx.reply('⛔ គ្មានសិទ្ធិ!');

    let rawInput = ctx.match[1].trim();
    let parts = rawInput.split(',').map(p => p.trim());
    let refsToDelete = [];

    for (let part of parts) {
        if (part.includes('-')) {
            let range = part.split('-').map(r => parseInt(r.trim()));
            if (!isNaN(range[0]) && !isNaN(range[1])) {
                if (range[1] - range[0] > 200) return ctx.reply('⚠️ ជួរធំពេក (អតិបរមា ២០០ Ref ក្នុងមួយដង)!');
                for (let i = range[0]; i <= range[1]; i++) {
                    refsToDelete.push(String(i));
                }
            }
        } else if (part) {
            let clean = part.replace(/ref:?\s*/i, '').trim().toUpperCase();
            if (clean) refsToDelete.push(clean);
        }
    }

    if (refsToDelete.length === 0) {
        return ctx.reply('⚠ សូមបញ្ជាក់លេខ Ref ដែលចង់លុបឱ្យបានត្រឹមត្រូវ (ឧ. `/deleteref 1` ឬ `/deleteref 1,2,3` ឬ `/deleteref 1-5`)', { parse_mode: 'Markdown' });
    }

    let successList = [];
    let notFoundList = [];

    for (let cleanRef of refsToDelete) {
        try {
            let check = await pool.query("SELECT * FROM products WHERE UPPER(ref) = $1", [cleanRef]);
            if (check.rows.length === 0) {
                notFoundList.push(cleanRef);
                continue;
            }

            let product = check.rows[0];

            await pool.query("DELETE FROM stock WHERE UPPER(ref) = $1", [cleanRef]);
            await pool.query("DELETE FROM purchases WHERE UPPER(ref) = $1", [cleanRef]);
            await pool.query("DELETE FROM products WHERE UPPER(ref) = $1", [cleanRef]);

            // លុប Media ចាស់ចេញពី Cloudinary ស្វ័យប្រវត្តិ
            if (product.video_url) {
                await deleteCloudinaryFileByUrl(product.video_url);
            }
            if (product.model_3d_url) {
                await deleteCloudinaryFileByUrl(product.model_3d_url);
            }

            successList.push(cleanRef);
        } catch (err) {
            console.error(`Error deleting ref ${cleanRef}:`, err);
        }
    }

    let reportMsg = `🗑️ **លទ្ធផលនៃការលុប Ref:**\n`;
    if (successList.length > 0) reportMsg += `✅ បានលុបជោគជ័យ: [ ${successList.join(', ')} ]\n`;
    if (notFoundList.length > 0) reportMsg += `❌ រកមិនឃើញ: [ ${notFoundList.join(', ')} ]`;

    ctx.reply(reportMsg, { parse_mode: 'Markdown' });
});

bot.command('web', async (ctx) => {
    if (!await isAdminUser(ctx.chat.id, ctx.from.username || '')) return ctx.reply('⛔️ គ្មានសិទ្ធិ!');
    await ctx.reply('🖥️ បើក Web Admin៖', {
        reply_markup: { inline_keyboard: [[{ text: '🖥️ Web Admin', web_app: { url: `${RAILWAY_HOST}/web-admin` } }]] }
    });
});

bot.command('cleanup', async (ctx) => {
    ctx.reply('🧹 ប្រព័ន្ធកំពុងប្រើប្រាស់ Cloudinary Cloud Storage 100% ដូច្នេះមិនចាំបាច់មានការសម្អាត Local File ទៀតទេ។');
});

// Manual payment review buttons (sent when Bakong could not confirm a payment automatically)
bot.action(/^manual_paid_(\d+)$/, async (ctx) => {
    try {
        const ok = await markOrderPaid(ctx.match[1]); // sends the normal order message (with Confirm/Cancel) to the admins
        if (!ok) return ctx.answerCbQuery('⚠ ដោះស្រាយរួចហើយ!', { show_alert: true });
        await ctx.answerCbQuery('✅ បានកត់ត្រាថាបង់ប្រាក់រួច!');
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\nstatus: ✅ បានទទួលប្រាក់ (បញ្ជាក់ដោយដៃ)', { reply_markup: { inline_keyboard: [] } });
    } catch (err) {
        console.error('manual_paid error:', err);
        await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true });
    }
});

bot.action(/^manual_cancel_(\d+)$/, async (ctx) => {
    try {
        const ok = await expireOrder(ctx.match[1]); // releases the reserved stock
        if (!ok) return ctx.answerCbQuery('⚠ ដោះស្រាយរួចហើយ!', { show_alert: true });
        await ctx.answerCbQuery('❌ បានលុបចោល និងសងស្តុកវិញ!');
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\nstatus: ❌ មិនបានទទួលប្រាក់ - លុបចោល', { reply_markup: { inline_keyboard: [] } });
    } catch (err) {
        console.error('manual_cancel error:', err);
        await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true });
    }
});

bot.action(/^confirm_order_(\d+)$/, async (ctx) => {
    let orderId = parseInt(ctx.match[1], 10);
    try {
        // only a PENDING order can be confirmed (before, a CANCELLED / unpaid order could be "confirmed" too)
        const r = await pool.query("UPDATE orders SET status = 'CONFIRMED' WHERE id = $1 AND status = 'PENDING' RETURNING id", [orderId]);
        if (r.rows.length === 0) return ctx.answerCbQuery('⚠ ការកុម្មង់នេះមិនស្ថិតក្នុងស្ថានភាព PENDING ទេ!', { show_alert: true });
        await ctx.answerCbQuery('✅ បានបញ្ជាក់ការកុម្មង់!');
        let originalText = ctx.callbackQuery.message.text;
        await ctx.editMessageText(originalText + '\n\nstatus: ✅ Confirmed', { reply_markup: { inline_keyboard: [] } });
    } catch (err) {
        console.error('confirm_order error:', err.message);
        await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true });
    }
});

bot.action(/^cancel_order_(\d+)$/, async (ctx) => {
    let orderId = parseInt(ctx.match[1], 10);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // status-guarded UPDATE: a double tap can no longer restore the stock twice
        const r = await client.query("UPDATE orders SET status = 'CANCELLED' WHERE id = $1 AND status IN ('PENDING','CONFIRMED') RETURNING items", [orderId]);
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return ctx.answerCbQuery('⚠ មិនអាចលុបចោលការកុម្មង់នេះបានទេ (លុបរួច / កំពុងរង់ចាំបង់ប្រាក់)!', { show_alert: true });
        }
        await restoreStockForItems(client, r.rows[0].items);
        await client.query('COMMIT');
        await ctx.answerCbQuery('❌ បានបដិសេធ និងសងស្តុកចូលវិញ!');
        let originalText = ctx.callbackQuery.message.text;
        await ctx.editMessageText(originalText + '\n\nstatus: ❌ Cancelled & Stock Restored', { reply_markup: { inline_keyboard: [] } });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) {}
        console.error('cancel_order error:', err.message);
        try { await ctx.answerCbQuery('❌ មានបញ្ហា', { show_alert: true }); } catch (e) {}
    } finally {
        client.release();
    }
});

// 🧊 Callback Handler ពេលសួរថាមាន 3D ទេ (Yes / No)
bot.action('has_3d_yes', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!userStates[chatId] || userStates[chatId].step !== 'ASK_HAS_3D') return;
    
    userStates[chatId].step = 'GET_3D_VIDEO';
    await ctx.answerCbQuery();
    await ctx.editMessageText('🧊 សូម Upload វីដេអូ 3D (360 degree) សម្រាប់ដាក់ Button View 3D៖');
});

bot.action('has_3d_no', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!userStates[chatId] || userStates[chatId].step !== 'ASK_HAS_3D') return;

    userStates[chatId].data.model_3d_url = ''; // គ្មាន 3D
    userStates[chatId].step = 'GENDER';

    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ គ្មាន 3D');
    await ctx.reply('ជ្រើសរើសប្រភេទភេទ:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Men (បុរស)', callback_data: 'gender_men' },
                    { text: 'Women (នារី)', callback_data: 'gender_women' }
                ]
            ]
        }
    });
});

bot.action(/^gender_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    if (!userStates[chatId] || userStates[chatId].step !== 'GENDER') return;

    let gender = ctx.match[1];
    userStates[chatId].data.gender = gender;
    userStates[chatId].step = 'TYPE';

    await ctx.answerCbQuery();
    await ctx.editMessageText(`🚻 ភេទ: ${gender === 'men' ? 'Men' : 'Women'}`);
    await ctx.reply('សូមបញ្ជាក់ប្រភេទ:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Tops (អាវ)', callback_data: 'type_tops' },
                    { text: 'Pants (ខោ)', callback_data: 'type_pants' }
                ],
                [
                    { text: 'Outerwear', callback_data: 'type_outerwear' },
                    { text: 'Dresses', callback_data: 'type_dresses' }
                ]
            ]
        }
    });
});

bot.action(/^type_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    if (!userStates[chatId] || userStates[chatId].step !== 'TYPE') return;

    let type = ctx.match[1];
    userStates[chatId].data.type = type;
    let state = userStates[chatId];

    await ctx.answerCbQuery();
    await ctx.editMessageText(`🏷️ ប្រភេទ: ${type}`);

    try {
        let cleanRef = String(state.data.ref).trim().toUpperCase();
        let parsedPrice = parseFloat(state.data.price) || 0;
        let parsedCost = 0;
        let tTitle = await autoTranslate(state.data.title_km);
        let tDesc = await autoTranslate(state.data.desc_km || '');

        await pool.query(
            `INSERT INTO products (ref, title_km, title_en, title_zh, desc_km, desc_en, desc_zh, gender, type, video_url, model_3d_url, price, cost_price) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
             ON CONFLICT (ref) DO UPDATE 
             SET title_km = $2, title_en = $3, title_zh = $4, desc_km = $5, desc_en = $6, desc_zh = $7, gender = $8, type = $9, video_url = $10, model_3d_url = $11, price = $12, cost_price = $13`,
            [cleanRef, state.data.title_km, tTitle.en, tTitle.zh, state.data.desc_km || '', tDesc.en, tDesc.zh, state.data.gender || 'men', state.data.type || 'tops', state.data.video_url || '', state.data.model_3d_url || '', parsedPrice, parsedCost]
        );

        if (state.action === 'ADD') {
            let sizes = ['S', 'M', 'L', 'XL', 'XXL'];
            for (let size of sizes) {
                await pool.query(
                    `INSERT INTO stock (ref, size, stock_qty, price) VALUES ($1, $2, $3, $4) ON CONFLICT (ref, size) DO UPDATE SET price = $4`,
                    [cleanRef, size, 0, parsedPrice]
                );
            }
        }

        await ctx.reply(`បន្ថែមទំនិញ Ref ${cleanRef} ថ្មីជោគជ័យ! 📦`);
    } catch (err) {
        await ctx.reply(`❌ មានបញ្ហា: ${err.message}`);
    }

    delete userStates[chatId];
});

bot.on('message', async (ctx) => {
    const chatId = ctx.chat.id;
    const msg = ctx.message;
    const text = msg.text || msg.caption || '';
    const username = ctx.from.username || '';

    if (userStates[chatId] && userStates[chatId].action === 'WAITING_PASSWORD') {
        let banCheck = await pool.query(
            "SELECT * FROM banned_admins WHERE chat_id = $1 OR (username != '' AND LOWER(username) = LOWER($2))",
            [chatId, username]
        );
        if (banCheck.rows.length > 0) {
            delete userStates[chatId];
            return ctx.reply('⛔️ អ្នកត្រូវបានគេដកសិទ្ធិ (Ban) ពីប្រព័ន្ធហើយ!');
        }

        const failed = pwFails.get(chatId) || { n: 0, until: 0 };
        if (Date.now() < failed.until) return ctx.reply('⏳ ព្យាយាមច្រើនពេក សូមរង់ចាំ ១៥ នាទី។');
        if (!BOT_PASSWORD) return ctx.reply('⚠️ ប្រព័ន្ធមិនទាន់កំណត់ BOT_PASSWORD ទេ សូមទាក់ទង Owner។');

        if (safeStrEq(text.trim(), BOT_PASSWORD)) {
            pwFails.delete(chatId);
            try { await ctx.deleteMessage(); } catch (e) {} // do not leave the password sitting in the chat
            let checkAdmins = await pool.query("SELECT COUNT(*) FROM admins");
            let isFirst = parseInt(checkAdmins.rows[0].count) === 0;

            await pool.query(
                "INSERT INTO admins (chat_id, username, is_owner) VALUES ($1, $2, $3) ON CONFLICT (chat_id) DO UPDATE SET username = $2",
                [chatId, username, isFirst]
            );
            delete userStates[chatId];
            return ctx.reply(isFirst ? '👑 Password ត្រឹមត្រូវ! អ្នកជា Owner ផ្លូវការ!' : '✅ Password ត្រឹមត្រូវ! សូមផ្ញើ /start សារថ្មី。');
        } else {
            failed.n++;
            if (failed.n >= 5) { failed.n = 0; failed.until = Date.now() + 15 * 60 * 1000; }
            pwFails.set(chatId, failed);
            return ctx.reply('❌ Password មិនត្រឹមត្រូវទេ!');
        }
    }

    let authorized = await isAdminUser(chatId, username);
    if (!authorized) return ctx.reply('⛔️ គ្មានសិទ្ធិ! សូមផ្ញើ /start ដើម្បីវាយបញ្ចូល Password។');

    if (!userStates[chatId]) return;
    let state = userStates[chatId];

    await ctx.sendChatAction('typing');

    if (state.action === 'WEBSITE') {
        if (state.step === 'WAITING_TITLE') {
            if (!text.trim()) return ctx.reply('⚠️ សូមផ្ញើសារ/អក្សរឱ្យបានត្រឹមត្រូវ!');
            await pool.query(
                "INSERT INTO website_settings (key, value) VALUES ('cover_title', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [text.trim()]
            );
            delete userStates[chatId];
            return ctx.reply(`✅ **ជោគជ័យ!** Banner Title ថ្មីត្រូវបានអាប់ដេត៖\n"${text.trim()}"`, { parse_mode: 'Markdown' });
        }

        if (state.step === 'WAITING_DELIVERY_FEE') {
            let inputVal = text.trim();
            if (!inputVal) return ctx.reply('⚠️ សូមបញ្ចូលតម្លៃ ឬអត្ថបទឱ្យបានត្រឹមត្រូវ!');
            
            await pool.query(
                "INSERT INTO website_settings (key, value) VALUES ('delivery_fee', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [inputVal]
            );
            delete userStates[chatId];
            return ctx.reply(`✅ **ជោគជ័យ!** ថ្លៃដឹក (Delivery Fee) ត្រូវបានកំណត់ជា៖ **${inputVal}**`, { parse_mode: 'Markdown' });
        }

        let uploadedUrl = '';
        let fileObj = getTelegramMediaObject(msg);

        if (fileObj) {
            try {
                uploadedUrl = await uploadTelegramFileToCloudinary(ctx, fileObj.file_id, 'oneday_shop');
            } catch (err) {
                return ctx.reply(`❌ Upload ទៅ Cloudinary បរាជ័យ: ${err.message}`);
            }
        } else if (isHttpsUrl(text)) {
            uploadedUrl = text.trim();
        } else {
            return ctx.reply('⚠️ សូម Upload វីដេអូ រូបភាព ឬផ្ញើ Link លីងឱ្យបានត្រឹមត្រូវ!');
        }

        if (state.step === 'WAITING_ADD_COVER') {
            await pool.query(
                "INSERT INTO website_covers (cover_url) VALUES ($1)",
                [uploadedUrl]
            );
            delete userStates[chatId];
            return ctx.reply(`✅ **ជោគជ័យ!** Cover ថ្មីត្រូវបានបន្ថែមចូលក្នុង Slider (Cloudinary) រួចរាល់៖\n${uploadedUrl}`, { parse_mode: 'Markdown' });
        }

        if (state.step === 'WAITING_ICON_LOGO') {
            await pool.query(
                "INSERT INTO website_settings (key, value) VALUES ('logo_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [uploadedUrl]
            );
            delete userStates[chatId];
            return ctx.reply(`✅ **ជោគជ័យ!** Logo Website ថ្មីត្រូវបានអាប់ដេតរួចរាល់！`);
        }

        if (state.step === 'WAITING_ICON_CART') {
            await pool.query(
                "INSERT INTO website_settings (key, value) VALUES ('cart_icon_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [uploadedUrl]
            );
            delete userStates[chatId];
            return ctx.reply(`✅ **ជោគជ័យ!** Cart Icon ថ្មីត្រូវបានអាប់ដេតរួចរាល់！`);
        }
    }

    if (state.action === 'CHANGE') {
        if (state.step === 'GET_REF') {
            let cleanRef = text.replace(/ref:?\s*/i, '').trim().toUpperCase();
            if (!cleanRef) return ctx.reply('⚠️ សូមបញ្ចូលលេខ Ref!');
            delete userStates[chatId];
            return handleEditRefSelection(ctx, chatId, cleanRef);
        }

        let ref = state.data.ref;
        if (state.step === 'UPDATE_TITLE') {
            if (!text.trim()) return ctx.reply('⚠️ សូមបញ្ចូលឈ្មោះ!');
            let tTitle = await autoTranslate(text.trim());
            await pool.query("UPDATE products SET title_km = $1, title_en = $2, title_zh = $3 WHERE UPPER(ref) = $4", [text.trim(), tTitle.en, tTitle.zh, ref]);
            delete userStates[chatId];
            return ctx.reply(`✅ កែប្រែឈ្មោះ Ref ${ref} ជោគជ័យ!`);
        }
        if (state.step === 'UPDATE_PRICE') {
            let newPrice = parseFloat(text);
            if (isNaN(newPrice) || newPrice < 0 || newPrice > 100000) return ctx.reply('⚠️ សូមបញ្ចូលតម្លៃលក់ជាតួលេខ (0 - 100000)!');
            await pool.query("UPDATE products SET price = $1 WHERE UPPER(ref) = $2", [newPrice, ref]);
            await pool.query("UPDATE stock SET price = $1 WHERE UPPER(ref) = $2", [newPrice, ref]);
            delete userStates[chatId];
            return ctx.reply(`✅ កែប្រែតម្លៃលក់ Ref ${ref} ជោគជ័យ!`);
        }
        if (state.step === 'UPDATE_DESC') {
            let tDesc = await autoTranslate(text.trim());
            await pool.query("UPDATE products SET desc_km = $1, desc_en = $2, desc_zh = $3 WHERE UPPER(ref) = $4", [text.trim(), tDesc.en, tDesc.zh, ref]);
            delete userStates[chatId];
            return ctx.reply(`✅ កែប្រែការបរិយាយ Ref ${ref} ជោគជ័យ!`);
        }
        if (state.step === 'UPDATE_VIDEO') {
            let videoUrl = '';
            let fileObj = getTelegramMediaObject(msg);

            if (fileObj) {
                try {
                    videoUrl = await uploadTelegramFileToCloudinary(ctx, fileObj.file_id, 'oneday_shop');
                } catch (err) {
                    return ctx.reply(`❌ បរាជ័យ: ${err.message}`);
                }
            } else if (isHttpsUrl(text)) {
                videoUrl = text.trim();
            } else {
                return ctx.reply('⚠️ សូម Upload Video ឬ រូបភាព (Image) ឬ Link https:// ឱ្យបានត្រឹមត្រូវ!');
            }

            try {
                let oldProd = await pool.query("SELECT video_url FROM products WHERE UPPER(ref) = $1", [ref]);
                if (oldProd.rows.length > 0 && oldProd.rows[0].video_url) {
                    let oldVideoUrl = oldProd.rows[0].video_url;
                    await pool.query("UPDATE products SET video_url = $1 WHERE UPPER(ref) = $2", [videoUrl, ref]);
                    await deleteCloudinaryFileByUrl(oldVideoUrl);
                } else {
                    await pool.query("UPDATE products SET video_url = $1 WHERE UPPER(ref) = $2", [videoUrl, ref]);
                }
            } catch (e) {
                await pool.query("UPDATE products SET video_url = $1 WHERE UPPER(ref) = $2", [videoUrl, ref]);
            }

            delete userStates[chatId];
            return ctx.reply(`✅ កែប្រែ Media (Cloudinary) សម្រាប់ Ref ${ref} ជោគជ័យ!`);
        }
        if (state.step === 'UPDATE_3D') {
            let model3dUrl = '';
            let fileObj = getTelegramMediaObject(msg);

            if (text.trim().toLowerCase() === 'none') {
                model3dUrl = '';
            } else if (fileObj) {
                try {
                    model3dUrl = await uploadTelegramFileToCloudinary(ctx, fileObj.file_id, 'oneday_shop');
                } catch (err) {
                    return ctx.reply(`❌ បរាជ័យ: ${err.message}`);
                }
            } else if (isHttpsUrl(text)) {
                model3dUrl = text.trim();
            } else {
                return ctx.reply('⚠️ សូម Upload វីដេអូ 3D, Link https:// ឬវាយ "none" ដើម្បីលុបចេញ!');
            }

            try {
                let oldProd = await pool.query("SELECT model_3d_url FROM products WHERE UPPER(ref) = $1", [ref]);
                if (oldProd.rows.length > 0 && oldProd.rows[0].model_3d_url) {
                    await deleteCloudinaryFileByUrl(oldProd.rows[0].model_3d_url);
                }
            } catch (e) {}

            await pool.query("UPDATE products SET model_3d_url = $1 WHERE UPPER(ref) = $2", [model3dUrl, ref]);
            delete userStates[chatId];
            return ctx.reply(`🧊 កែប្រែវីដេអូ 3D សម្រាប់ Ref ${ref} ជោគជ័យ!`);
        }
        return;
    }

    switch (state.step) {
        case 'GET_REF':
            let inputRef = text.replace(/ref:?\s*/i, '').trim().toUpperCase();
            if (!inputRef) return ctx.reply('⚠️ សូមបញ្ចូលលេខ Ref ឱ្យបានត្រឹមត្រូវ!');
            
            let checkDup = await pool.query("SELECT * FROM products WHERE UPPER(ref) = $1", [inputRef]);
            if (checkDup.rows.length > 0) {
                return ctx.reply(`⚠️ លេខ Ref **${inputRef}** នេះមានក្នុងប្រព័ន្ធរួចហើយ! សូមបញ្ចូលលេខ Ref ផ្សេងទៀត៖`, { parse_mode: 'Markdown' });
            }

            state.data = { ref: inputRef };
            state.step = 'TITLE';
            return ctx.reply(`✅ ជ្រើសរើសប្រើប្រាស់ Ref : **${inputRef}**\n\nសូមសរសេរបញ្ចូលឈ្មោះទំនិញ៖`, { parse_mode: 'Markdown' });

        case 'TITLE':
            if (!text.trim()) return ctx.reply('⚠️ បញ្ចូលឈ្មោះទំនិញ');
            state.data.title_km = text.trim();
            state.data.cost_price = 0;
            state.step = 'PRICE';
            return ctx.reply('💵 សូមសរសេរបញ្ចូលតម្លៃលក់ (ឧទាហរណ៍: 15.00):');
        case 'PRICE':
            let parsedPrice = parseFloat(text.trim());
            if (isNaN(parsedPrice) || parsedPrice <= 0) {
                return ctx.reply('⚠️ សូមបញ្ចូលតម្លៃលក់ជាតួលេខឱ្យបានត្រឹមត្រូវ (ឧ. 15 ឬ 15.50)!');
            }
            state.data.price = parsedPrice;
            state.step = 'DESC';
            return ctx.reply('សូមសេរការបរិយាយពីទំនិញ:');
        case 'DESC':
            state.data.desc_km = text.trim();
            state.step = 'VIDEO';
            return ctx.reply('សូម Upload វីដេអូ ឬ រូបភាព (Image/Video/GIF/Link):');
        case 'VIDEO':
            let videoUrl = '';
            let fileObj = getTelegramMediaObject(msg);

            if (fileObj) {
                try {
                    videoUrl = await uploadTelegramFileToCloudinary(ctx, fileObj.file_id, 'oneday_shop');
                } catch (err) {
                    return ctx.reply(`❌ Upload ទៅ Cloudinary បរាជ័យ: ${err.message}`);
                }
            } else if (isHttpsUrl(text)) {
                videoUrl = text.trim();
            } else {
                return ctx.reply('⚠️ សូម Upload Video ឬ រូបភាព (Image) ឬ Link https:// ឱ្យបានត្រឹមត្រូវ!');
            }

            state.data.video_url = videoUrl;
            state.step = 'ASK_HAS_3D';

            return ctx.reply('🧊 តើទំនិញនេះមានវីដេអូ 3D (360 degree) ដែរឬទេ?', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ មាន (Yes)', callback_data: 'has_3d_yes' },
                            { text: '❌ គ្មាន (No)', callback_data: 'has_3d_no' }
                        ]
                    ]
                }
            });

        case 'GET_3D_VIDEO':
            let model3dUrl = '';
            let file3dObj = getTelegramMediaObject(msg);

            if (file3dObj) {
                try {
                    model3dUrl = await uploadTelegramFileToCloudinary(ctx, file3dObj.file_id, 'oneday_shop');
                } catch (err) {
                    return ctx.reply(`❌ Upload 3D ទៅ Cloudinary បរាជ័យ: ${err.message}`);
                }
            } else if (isHttpsUrl(text)) {
                model3dUrl = text.trim();
            } else {
                return ctx.reply('⚠️ សូម Upload វីដេអូ 3D ឬ Link https:// ឱ្យបានត្រឹមត្រូវ!');
            }

            state.data.model_3d_url = model3dUrl;
            state.step = 'GENDER';

            return ctx.reply('ជ្រើសរើសប្រភេទភេទ:', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Men (បុរស)', callback_data: 'gender_men' },
                            { text: 'Women (នារី)', callback_data: 'gender_women' }
                        ]
                    ]
                }
            });
    }
});

bot.telegram.setMyCommands([
    { command: 'start', description: 'ចាប់ផ្តើមប្រព័ន្ធ / ផ្ទៀងផ្ទាត់ Password' },
    { command: 'stats', description: 'មើលរបាយការណ៍ និងស្ថិតិសរុប' },
    { command: 'orders', description: 'មើលបញ្ជីកុម្មង់កំពុងរង់ចាំ (Pending Orders)' },
    { command: 'search', description: 'ស្វែងរកទំនិញតាម Ref (ឧ. /search 1)' },
    { command: 'website', description: 'កែប្រែ Cover Slider (Add/Delete), Logo & Banner' },
    { command: 'delivery', description: 'កែប្រែថ្លៃដឹក (Delivery Fee ឬ ទូទាត់ជាមួយហាង)' },
    { command: 'checkadmin', description: 'មើលបញ្ជី Owner និង Admin (សម្រាប់ Owner)' },
    { command: 'add', description: 'បន្ថែមទំនិញថ្មីចូលស្តុក (Image/Video & 3D)' },
    { command: 'change', description: 'កែប្រែព័ត៌មានទំនិញ' },
    { command: 'web', description: 'បើក Web Admin (គ្រប់គ្រងទំនិញ/ស្តុក/កុម្មង់ក្នុង Browser)' },
    { command: 'cleanup', description: 'សម្អាត Media ចាស់ៗ (Cloudinary Ready)' },
    { command: 'cancel', description: 'បោះបង់សកម្មភាពកំពុងរត់' },
    { command: 'setmeowner', description: 'កំណត់សិទ្ធិ Owner (ប្រើពេលដំបូង)' }
]).catch(err => console.error("Set commands error:", err));

// A 409 "terminated by other getUpdates request" means ANOTHER copy of this bot (same token) is running, e.g. an old
// deployment or a local test. It used to crash the whole server (and any payment being checked at that moment).
function launchBot(attempt) {
    bot.launch().catch(err => {
        console.error(`Telegram bot launch failed (attempt ${attempt}):`, err.message);
        setTimeout(() => launchBot(attempt + 1), Math.min(30000, 5000 * attempt));
    });
}
launchBot(1);
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection (server kept running):', reason));
console.log('Telegram Bot started successfully with Cloudinary...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
