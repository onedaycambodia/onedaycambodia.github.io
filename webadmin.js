// Web admin API: manage products, stock, orders and see stats from a browser.
// Uses the SAME admins table as the Telegram bot, so whoever is an Admin/Owner in the bot can log in here.
//
// Login: "Login with Telegram" (needs `/setdomain` in @BotFather) or, inside the bot, the /web button (Mini App).
// Both are verified server-side with the bot token (HMAC), then a signed HttpOnly session cookie is issued.

const crypto = require('crypto');
const path = require('path');

const ALLOWED_GENDERS = ['men', 'women'];
const ALLOWED_TYPES = ['tops', 'pants', 'outerwear', 'dresses'];
const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const SESSION_HOURS = 12;

module.exports = function mountWebAdmin(app, deps) {
    const { pool, bot, cloudinary, autoTranslate, isAdminUser, deleteCloudinaryFileByUrl, restoreStockForItems, botToken } = deps;

    // ---------- crypto helpers ----------
    const b64u = (buf) => Buffer.from(buf).toString('base64url');
    // With no BOT_TOKEN a constant key would let anyone forge a session cookie, so use a random key (all sessions then die on restart).
    const sessionKey = botToken ? crypto.createHmac('sha256', botToken).update('web-admin-session-v1').digest() : crypto.randomBytes(32);

    function safeEqual(a, b) {
        const x = Buffer.from(String(a)), y = Buffer.from(String(b));
        return x.length === y.length && crypto.timingSafeEqual(x, y);
    }

    function signSession(payload) {
        const body = b64u(JSON.stringify(payload));
        const sig = b64u(crypto.createHmac('sha256', sessionKey).update(body).digest());
        return `${body}.${sig}`;
    }

    function readSession(token) {
        if (!token || token.indexOf('.') < 0) return null;
        const [body, sig] = token.split('.');
        const expect = b64u(crypto.createHmac('sha256', sessionKey).update(body).digest());
        if (!safeEqual(sig, expect)) return null;
        try {
            const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
            return p.exp > Date.now() ? p : null;
        } catch (e) { return null; }
    }

    function parseCookies(header) {
        const out = {};
        String(header || '').split(';').forEach(part => {
            const i = part.indexOf('=');
            if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
        });
        return out;
    }

    // Telegram Login Widget: hash = HMAC_SHA256(key = SHA256(bot_token), "k=v\n..." sorted, without hash)
    function verifyLoginWidget(data) {
        if (!botToken || !data || !data.hash || !data.id || !data.auth_date) return null;
        const check = Object.keys(data).filter(k => k !== 'hash').sort().map(k => `${k}=${data[k]}`).join('\n');
        const secret = crypto.createHash('sha256').update(botToken).digest();
        const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
        if (!safeEqual(calc, String(data.hash))) return null;
        if (Date.now() / 1000 - Number(data.auth_date) > 86400) return null;
        return { id: Number(data.id), username: data.username || '' };
    }

    // Telegram Mini App initData: secret = HMAC_SHA256(key "WebAppData", bot_token)
    function verifyInitData(initData) {
        if (!botToken || !initData || typeof initData !== 'string') return null;
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;
        params.delete('hash');
        const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
        const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
        if (!safeEqual(calc, hash)) return null;
        if (Date.now() / 1000 - Number(params.get('auth_date') || 0) > 86400) return null;
        try {
            const u = JSON.parse(params.get('user') || '{}');
            return u.id ? { id: Number(u.id), username: u.username || '' } : null;
        } catch (e) { return null; }
    }

    // Who is calling? Session cookie (web admin) or signed Mini App initData header. Admin rights are re-checked every time.
    async function authorize(req) {
        let who = null;
        const sess = readSession(parseCookies(req.headers.cookie).wa_session);
        if (sess) who = { id: sess.id, username: sess.username };
        if (!who) who = verifyInitData(req.headers['x-telegram-init-data']);
        if (!who) return null;
        return (await isAdminUser(who.id, who.username)) ? who : null;
    }

    const loginHits = new Map();
    function loginLimited(ip) {
        const now = Date.now();
        const hits = (loginHits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
        hits.push(now);
        loginHits.set(ip, hits);
        return hits.length > 20;
    }

    const wrap = (fn) => async (req, res) => {
        try { await fn(req, res); }
        catch (err) { console.error('web-admin error:', err); res.status(500).json({ error: 'Server error' }); }
    };

    // admin-only route; non-GET also needs the custom header (blocks cross-site form posts)
    const guarded = (fn) => wrap(async (req, res) => {
        if (req.method !== 'GET' && req.headers['x-webadmin'] !== '1') return res.status(403).json({ error: 'Bad request' });
        const who = await authorize(req);
        if (!who) return res.status(401).json({ error: 'Not logged in' });
        req.admin = who;
        await fn(req, res);
    });

    // ---------- page + login ----------
    app.get('/web-admin', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(__dirname, 'web-admin.html'));
    });

    let botUsername = null;
    app.get('/api/web-admin/config', wrap(async (req, res) => {
        if (!botUsername) {
            try { botUsername = (await bot.telegram.getMe()).username; } catch (e) { /* retry next time */ }
        }
        res.json({ bot_username: botUsername });
    }));

    app.post('/api/web-admin/login', wrap(async (req, res) => {
        if (req.headers['x-webadmin'] !== '1') return res.status(403).json({ error: 'Bad request' });
        if (loginLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts' });

        const body = req.body || {};
        const who = body.initData ? verifyInitData(body.initData) : verifyLoginWidget(body.widget);
        if (!who) return res.status(401).json({ error: 'Telegram login could not be verified' });
        if (!(await isAdminUser(who.id, who.username))) return res.status(403).json({ error: 'This Telegram account is not an Admin of the shop bot' });

        const token = signSession({ id: who.id, username: who.username, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
        res.set('Set-Cookie', `wa_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${req.secure ? '; Secure' : ''}`);
        res.json({ ok: true, username: who.username });
    }));

    app.post('/api/web-admin/logout', wrap(async (req, res) => {
        res.set('Set-Cookie', `wa_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${req.secure ? '; Secure' : ''}`);
        res.json({ ok: true });
    }));

    app.get('/api/web-admin/me', guarded(async (req, res) => res.json({ id: req.admin.id, username: req.admin.username })));

    // ---------- Cloudinary: the browser uploads photos/videos straight to Cloudinary (never through this server) ----------
    app.get('/api/web-admin/upload-signature', guarded(async (req, res) => {
        const cfg = cloudinary.config();
        const params = { folder: 'oneday_shop', timestamp: Math.floor(Date.now() / 1000) };
        const signature = cloudinary.utils.api_sign_request(params, cfg.api_secret);
        res.json({ cloud_name: cfg.cloud_name, api_key: cfg.api_key, signature, ...params });
    }));

    // ---------- products ----------
    const cleanRef = (v) => String(v || '').trim().toUpperCase();
    const refOk = (r) => /^[A-Z0-9_-]{1,50}$/.test(r);
    const num = (v, def = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };
    const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const urlOrEmpty = (v) => { v = String(v || '').trim(); return v === '' || /^https:\/\/\S+$/i.test(v) ? v : null; };

    app.get('/api/web-admin/products', guarded(async (req, res) => {
        const r = await pool.query(`
            SELECT p.*, COALESCE(json_agg(json_build_object('size', s.size, 'stock_qty', s.stock_qty) ORDER BY
                       CASE s.size WHEN 'S' THEN 1 WHEN 'M' THEN 2 WHEN 'L' THEN 3 WHEN 'XL' THEN 4 WHEN 'XXL' THEN 5 ELSE 9 END)
                       FILTER (WHERE s.size IS NOT NULL), '[]') AS sizes
            FROM products p LEFT JOIN stock s ON s.ref = p.ref
            GROUP BY p.ref
            ORDER BY NULLIF(regexp_replace(p.ref, '\\D', '', 'g'), '')::NUMERIC DESC NULLS LAST, p.ref DESC`);
        res.json(r.rows);
    }));

    async function readProductBody(b, isCreate) {
        const ref = cleanRef(b.ref);
        if (!refOk(ref)) return { error: 'Ref មិនត្រឹមត្រូវ (ប្រើតែអក្សរអង់គ្លេស លេខ - _ ត្រឹម ៥០ តួ)' };
        const title_km = txt(b.title_km, 255);
        if (!title_km) return { error: 'សូមបំពេញឈ្មោះទំនិញ (ខ្មែរ)' };
        const price = num(b.price, NaN), cost = num(b.cost_price, 0);
        if (!(price >= 0 && price <= 100000)) return { error: 'តម្លៃលក់មិនត្រឹមត្រូវ' };
        if (!(cost >= 0 && cost <= 100000)) return { error: 'តម្លៃដើមមិនត្រឹមត្រូវ' };
        const gender = ALLOWED_GENDERS.includes(b.gender) ? b.gender : null;
        const type = ALLOWED_TYPES.includes(b.type) ? b.type : null;
        if (!gender || !type) return { error: 'សូមជ្រើសរើស Gender និង Type' };
        const video_url = urlOrEmpty(b.video_url), model_3d_url = urlOrEmpty(b.model_3d_url);
        if (video_url === null || model_3d_url === null) return { error: 'Link Media ត្រូវចាប់ផ្តើមដោយ https://' };

        const desc_km = txt(b.desc_km, 5000);
        let title_en = txt(b.title_en, 255), title_zh = txt(b.title_zh, 255);
        let desc_en = txt(b.desc_en, 5000), desc_zh = txt(b.desc_zh, 5000);
        // blank translations are filled in automatically from the Khmer text (same as the bot does)
        if (!title_en || !title_zh) { const t = await autoTranslate(title_km); title_en = title_en || t.en; title_zh = title_zh || t.zh; }
        if (desc_km && (!desc_en || !desc_zh)) { const t = await autoTranslate(desc_km); desc_en = desc_en || t.en; desc_zh = desc_zh || t.zh; }
        return { v: { ref, title_km, title_en, title_zh, desc_km, desc_en, desc_zh, gender, type, video_url, model_3d_url, price, cost } };
    }

    app.post('/api/web-admin/products', guarded(async (req, res) => {
        const { v, error } = await readProductBody(req.body || {}, true);
        if (error) return res.status(400).json({ error });
        const exists = await pool.query('SELECT 1 FROM products WHERE UPPER(ref) = $1', [v.ref]);
        if (exists.rows.length) return res.status(409).json({ error: `Ref ${v.ref} មានរួចហើយ` });

        await pool.query(
            `INSERT INTO products (ref, title_km, title_en, title_zh, desc_km, desc_en, desc_zh, gender, type, video_url, model_3d_url, price, cost_price)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [v.ref, v.title_km, v.title_en, v.title_zh, v.desc_km, v.desc_en, v.desc_zh, v.gender, v.type, v.video_url, v.model_3d_url, v.price, v.cost]);
        for (const size of DEFAULT_SIZES) {
            await pool.query(`INSERT INTO stock (ref, size, stock_qty, price) VALUES ($1,$2,0,$3) ON CONFLICT (ref, size) DO UPDATE SET price = $3`, [v.ref, size, v.price]);
        }
        res.json({ ok: true, ref: v.ref });
    }));

    app.put('/api/web-admin/products/:ref', guarded(async (req, res) => {
        const ref = cleanRef(req.params.ref);
        const old = await pool.query('SELECT video_url, model_3d_url FROM products WHERE UPPER(ref) = $1', [ref]);
        if (!old.rows.length) return res.status(404).json({ error: 'រកមិនឃើញទំនិញ' });

        const { v, error } = await readProductBody({ ...(req.body || {}), ref }, false);
        if (error) return res.status(400).json({ error });

        await pool.query(
            `UPDATE products SET title_km=$2, title_en=$3, title_zh=$4, desc_km=$5, desc_en=$6, desc_zh=$7, gender=$8, type=$9,
                    video_url=$10, model_3d_url=$11, price=$12, cost_price=$13 WHERE UPPER(ref) = $1`,
            [ref, v.title_km, v.title_en, v.title_zh, v.desc_km, v.desc_en, v.desc_zh, v.gender, v.type, v.video_url, v.model_3d_url, v.price, v.cost]);
        await pool.query('UPDATE stock SET price = $2 WHERE UPPER(ref) = $1', [ref, v.price]);

        // replaced media is removed from Cloudinary, like the bot does
        const o = old.rows[0];
        if (o.video_url && o.video_url !== v.video_url) await deleteCloudinaryFileByUrl(o.video_url);
        if (o.model_3d_url && o.model_3d_url !== v.model_3d_url) await deleteCloudinaryFileByUrl(o.model_3d_url);
        res.json({ ok: true });
    }));

    app.delete('/api/web-admin/products/:ref', guarded(async (req, res) => {
        const ref = cleanRef(req.params.ref);
        const p = await pool.query('SELECT video_url, model_3d_url FROM products WHERE UPPER(ref) = $1', [ref]);
        if (!p.rows.length) return res.status(404).json({ error: 'រកមិនឃើញទំនិញ' });
        await pool.query('DELETE FROM stock WHERE UPPER(ref) = $1', [ref]);
        await pool.query('DELETE FROM purchases WHERE UPPER(ref) = $1', [ref]);
        await pool.query('DELETE FROM products WHERE UPPER(ref) = $1', [ref]);
        if (p.rows[0].video_url) await deleteCloudinaryFileByUrl(p.rows[0].video_url);
        if (p.rows[0].model_3d_url) await deleteCloudinaryFileByUrl(p.rows[0].model_3d_url);
        res.json({ ok: true });
    }));

    // ---------- stock (per size). `delta` is safe against customers ordering at the same moment; `qty` sets an exact number ----------
    app.post('/api/web-admin/stock', guarded(async (req, res) => {
        const ref = cleanRef(req.body.ref), size = String(req.body.size || '').trim().toUpperCase();
        if (!refOk(ref) || !/^[A-Z0-9]{1,10}$/.test(size)) return res.status(400).json({ error: 'Ref ឬ Size មិនត្រឹមត្រូវ' });
        const hasQty = req.body.qty !== undefined && req.body.qty !== null && req.body.qty !== '';
        const n = parseInt(hasQty ? req.body.qty : req.body.delta, 10);
        if (!Number.isInteger(n) || Math.abs(n) > 100000) return res.status(400).json({ error: 'ចំនួនមិនត្រឹមត្រូវ' });
        if (hasQty && n < 0) return res.status(400).json({ error: 'ចំនួនមិនអាចតិចជាង 0' });

        const prod = await pool.query('SELECT price FROM products WHERE UPPER(ref) = $1', [ref]);
        if (!prod.rows.length) return res.status(404).json({ error: 'រកមិនឃើញទំនិញ' });

        const r = hasQty
            ? await pool.query(`INSERT INTO stock (ref, size, stock_qty, price) VALUES ($1,$2,$3,$4)
                                ON CONFLICT (ref, size) DO UPDATE SET stock_qty = $3 RETURNING stock_qty`, [ref, size, n, prod.rows[0].price])
            : await pool.query(`INSERT INTO stock (ref, size, stock_qty, price) VALUES ($1,$2,GREATEST($3,0),$4)
                                ON CONFLICT (ref, size) DO UPDATE SET stock_qty = GREATEST(stock.stock_qty + $3, 0) RETURNING stock_qty`, [ref, size, n, prod.rows[0].price]);
        res.json({ ok: true, stock_qty: r.rows[0].stock_qty });
    }));

    // ---------- orders ----------
    const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'AWAITING_PAYMENT', 'EXPIRED'];
    const parseJson = (v, fallback) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return fallback; } };

    app.get('/api/web-admin/orders', guarded(async (req, res) => {
        const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
        const r = await pool.query(
            `SELECT id, customer, items, total, status, payment_method, pay_amount, paid_at, created_at
             FROM orders WHERE ($1::text IS NULL OR status = $1) ORDER BY id DESC LIMIT 100`, [status]);
        res.json(r.rows.map(o => ({ ...o, customer: parseJson(o.customer, {}), items: parseJson(o.items, []) })));
    }));

    app.post('/api/web-admin/orders/:id/confirm', guarded(async (req, res) => {
        const r = await pool.query("UPDATE orders SET status = 'CONFIRMED' WHERE id = $1 AND status = 'PENDING' RETURNING id", [parseInt(req.params.id, 10) || 0]);
        if (!r.rows.length) return res.status(409).json({ error: 'ការកុម្មង់នេះមិនស្ថិតក្នុងស្ថានភាព PENDING ទេ' });
        res.json({ ok: true });
    }));

    app.post('/api/web-admin/orders/:id/cancel', guarded(async (req, res) => {
        const id = parseInt(req.params.id, 10) || 0;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const r = await client.query("UPDATE orders SET status = 'CANCELLED' WHERE id = $1 AND status IN ('PENDING','CONFIRMED') RETURNING items, payment_method, pay_amount, customer_id", [id]);
            if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'មិនអាចលុបការកុម្មង់នេះបានទេ' }); }
            await restoreStockForItems(client, r.rows[0].items);
            const o = r.rows[0];
            if (o.payment_method === 'WALLET' && o.customer_id && Number(o.pay_amount) > 0) { // wallet-paid order: money goes back to the customer's wallet
                const b = await client.query('UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance', [o.pay_amount, o.customer_id]);
                if (b.rows.length) await client.query(`INSERT INTO wallet_tx (customer_id, type, amount, balance_after, ref) VALUES ($1,'refund',$2,$3,$4)`, [o.customer_id, o.pay_amount, b.rows[0].wallet_balance, 'order:' + id]);
            }
            await client.query('COMMIT');
            res.json({ ok: true, refunded: o.payment_method === 'WALLET' });
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch (e) {}
            throw err;
        } finally {
            client.release();
        }
    }));

    // ---------- customers (with wallet balance) ----------
    app.get('/api/web-admin/customers', guarded(async (req, res) => {
        const q = '%' + String(req.query.q || '').trim().toLowerCase().slice(0, 60) + '%';
        const sql = (wallet) => `SELECT c.id, c.name, c.phone, c.email, c.avatar, c.created_at, c.last_login_at, ${wallet ? 'COALESCE(c.wallet_balance,0)' : '0'}::float AS wallet,
                (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id)::int AS orders,
                (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'CONFIRMED')::float AS spent
             FROM customers c WHERE LOWER(COALESCE(c.name,'') || ' ' || COALESCE(c.phone,'') || ' ' || COALESCE(c.email,'')) LIKE $1 ORDER BY c.id DESC LIMIT 300`;
        let r;
        try { r = await pool.query(sql(true), [q]); } catch (e) { r = await pool.query(sql(false), [q]); }
        res.json(r.rows);
    }));

    // ---------- dashboard ----------
    app.get('/api/web-admin/stats', guarded(async (req, res) => {
        const rangeDays = [7, 30, 90].includes(parseInt(req.query.days, 10)) ? parseInt(req.query.days, 10) : 7;
        const itemsOf = `jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END)`;
        const [counts, sales, profit, days, low, out, top, prods] = await Promise.all([
            pool.query('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status'),
            pool.query("SELECT COALESCE(SUM(total),0)::float AS v FROM orders WHERE status = 'CONFIRMED'"),
            pool.query(`SELECT COALESCE(SUM((i->>'profit')::numeric),0)::float AS v FROM orders o, ${itemsOf} i WHERE o.status = 'CONFIRMED'`),
            pool.query(`SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Phnom_Penh', 'YYYY-MM-DD') AS d,
                               SUM(total)::float AS sales, COUNT(*)::int AS orders
                        FROM orders WHERE status = 'CONFIRMED' AND created_at > NOW() - make_interval(days => $1) GROUP BY d ORDER BY d`, [rangeDays]),
            pool.query(`SELECT s.ref, p.title_km, s.size, s.stock_qty FROM stock s JOIN products p ON p.ref = s.ref
                        WHERE s.stock_qty BETWEEN 1 AND 2 ORDER BY s.stock_qty, s.ref LIMIT 30`),
            pool.query('SELECT COUNT(*)::int AS n FROM stock WHERE stock_qty <= 0'),
            pool.query(`SELECT i->>'ref' AS ref, MAX(i->>'title') AS title, SUM((i->>'qty')::int)::int AS qty
                        FROM orders o, ${itemsOf} i WHERE o.status = 'CONFIRMED' GROUP BY i->>'ref' ORDER BY qty DESC LIMIT 5`),
            pool.query('SELECT COUNT(*)::int AS n FROM products')
        ]);
        const byStatus = {};
        counts.rows.forEach(r => { byStatus[r.status] = r.n; });
        res.json({
            orders_by_status: byStatus,
            confirmed_sales: sales.rows[0].v,
            confirmed_profit: profit.rows[0].v,
            products: prods.rows[0].n,
            sizes_out_of_stock: out.rows[0].n,
            last_days: days.rows,
            range_days: rangeDays,
            wallet_total: await pool.query('SELECT COALESCE(SUM(wallet_balance),0)::float AS v FROM customers').then(r => r.rows[0].v).catch(() => 0),
            customers_total: await pool.query('SELECT COUNT(*)::int AS n FROM customers').then(r => r.rows[0].n).catch(() => 0),
            low_stock: low.rows,
            top_sellers: top.rows
        });
    }));

    return { authorize };
};
