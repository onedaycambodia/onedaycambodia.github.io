// 👤 Customer accounts: name + phone -> 4-digit code sent by Telegram's official "Verification Codes"
// account (Telegram Gateway API) -> long-lived session token. Also "My orders".
//
// Env (Railway):  GATEWAY_TOKEN   = Access Token from gateway.telegram.org -> API tab
// Without GATEWAY_TOKEN the whole feature is OFF and the website works exactly as before.
const crypto = require('crypto');

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://gatewayapi.telegram.org';
const OTP_TTL_SEC = 300;            // code valid 5 minutes
const OTP_MAX_TRIES = 5;
const SESSION_DAYS = 400;           // login lasts ~13 months (rolling)

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Cambodian numbers: 012 345 678 / +855 12 345 678 / 85512345678 -> "85512345678"
function canonPhone(raw) {
    let d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('855')) { /* ok */ }
    else if (d.startsWith('0')) d = '855' + d.slice(1);
    else if (d.length >= 8 && d.length <= 9) d = '855' + d;
    if (d.length < 10 || d.length > 15) return null;
    return d;
}
const showPhone = (c) => (c.startsWith('855') ? '0' + c.slice(3) : '+' + c);

module.exports = function (app, { pool }) {
    const TOKEN = process.env.GATEWAY_TOKEN || '';
    const TG_ID = String(process.env.TG_CLIENT_ID || '').trim();
    const TG_SECRET = String(process.env.TG_CLIENT_SECRET || '').trim();
    // 'telegram' = "Log in with Telegram" (free)  |  'gateway' = 4-digit code via Telegram Gateway (paid)  |  null = off
    const GOOGLE_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();   // "Continue with Google" (Gmail)
    const TT_KEY = String(process.env.TIKTOK_CLIENT_KEY || '').trim();       // "Continue with TikTok" (Login Kit)
    const TT_SECRET = String(process.env.TIKTOK_CLIENT_SECRET || '').trim();
    const TT_ON = !!(TT_KEY && TT_SECRET);
    const provider = (TG_ID && TG_SECRET) ? 'telegram' : (TOKEN ? 'gateway' : (GOOGLE_ID ? 'google' : null));
    const enabled = !!provider || TT_ON;
    const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(24).toString('hex');

    // ---------- tiny in-memory rate limiter ----------
    const hits = new Map();
    function limited(key, max, windowMs) {
        const now = Date.now();
        const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
        arr.push(now); hits.set(key, arr);
        return arr.length > max;
    }
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600000) hits.delete(k);
    }, 10 * 60 * 1000).unref();

    // ---------- tables (retries until the orders table exists) ----------
    async function init(attempt = 1) {
        try {
            await pool.query(`CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE NOT NULL, name VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW(), last_login_at TIMESTAMPTZ DEFAULT NOW())`);
            await pool.query(`CREATE TABLE IF NOT EXISTS customer_otps (
                phone VARCHAR(20) PRIMARY KEY, name VARCHAR(100), code_hash CHAR(64) NOT NULL,
                attempts INT DEFAULT 0, sent_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL)`);
            await pool.query(`CREATE TABLE IF NOT EXISTS customer_sessions (
                token_hash CHAR(64) PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT NOW(), last_seen TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL)`);
            await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tg_id BIGINT`);
            // Google (Gmail) accounts have no phone number -> phone becomes optional
            await pool.query(`ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL`);
            await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
            await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64)`);
            await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar TEXT`);
            await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_google_sub ON customers (google_sub) WHERE google_sub IS NOT NULL`);
            await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers (LOWER(email)) WHERE email IS NOT NULL`);
            await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tiktok_open_id VARCHAR(64)`);
            await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tiktok ON customers (tiktok_open_id) WHERE tiktok_open_id IS NOT NULL`);
            await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id)`);
            console.log('Customer accounts ready. Login provider:', provider || 'OFF (set TG_CLIENT_ID + TG_CLIENT_SECRET)');
        } catch (e) {
            console.error('customers init failed (attempt ' + attempt + '):', e.message);
            if (attempt < 10) setTimeout(() => init(attempt + 1), 3000 * attempt).unref();
        }
    }
    init();
    setInterval(() => {
        pool.query("DELETE FROM customer_otps WHERE expires_at < NOW() - interval '1 hour'").catch(() => {});
        pool.query("DELETE FROM customer_sessions WHERE expires_at < NOW()").catch(() => {});
    }, 60 * 60 * 1000).unref();

    // ---------- session helpers ----------
    const bearer = (req) => {
        const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
        return m ? m[1] : null;
    };
    async function authCustomer(req) {
        const tok = bearer(req);
        if (!tok) return null;
        try {
            const r = await pool.query(
                `SELECT c.id, c.name, c.phone, c.email, c.avatar, s.last_seen FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
                 WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [sha(tok)]);
            if (!r.rows.length) return null;
            const c = r.rows[0];
            if (Date.now() - new Date(c.last_seen).getTime() > 24 * 3600 * 1000) { // rolling expiry, 1 write/day
                pool.query(`UPDATE customer_sessions SET last_seen = NOW(), expires_at = NOW() + make_interval(days => $2) WHERE token_hash = $1`,
                    [sha(tok), SESSION_DAYS]).catch(() => {});
            }
            return { id: c.id, name: c.name, phone: c.phone, email: c.email, avatar: c.avatar };
        } catch (e) { console.error('authCustomer:', e.message); return null; }
    }
    const publicCustomer = (c) => ({ name: c.name, phone: c.phone ? showPhone(c.phone) : '', email: c.email || '', avatar: c.avatar || '' });
    async function fullCustomer(id) {
        const r = await pool.query('SELECT id, name, phone, email, avatar FROM customers WHERE id = $1', [id]);
        return r.rows[0];
    }
    // profile picture from Google / Telegram: only used while the customer has not uploaded their own
    async function setPicture(id, url) {
        if (typeof url !== 'string' || !/^https:\/\/[^\s'"<>]{5,500}$/.test(url)) return;
        await pool.query("UPDATE customers SET avatar = $1 WHERE id = $2 AND (avatar IS NULL OR avatar LIKE 'http%')", [url, id]).catch(() => {});
    }

    // ---------- Telegram Gateway ----------
    async function sendCode(phone, code) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
            const r = await fetch(GATEWAY_URL + '/sendVerificationMessage', {
                method: 'POST', signal: ctrl.signal,
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
                body: JSON.stringify({ phone_number: '+' + phone, code, ttl: OTP_TTL_SEC })
            });
            const j = await r.json().catch(() => ({}));
            if (j && j.ok) return { ok: true };
            return { ok: false, error: String((j && j.error) || ('HTTP ' + r.status)) };
        } catch (e) {
            return { ok: false, error: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
        } finally { clearTimeout(t); }
    }

    // ---------- API ----------
    app.get('/api/auth/config', (req, res) => res.json({ enabled, provider, client_id: provider === 'telegram' ? TG_ID : undefined, google_client_id: GOOGLE_ID || undefined, tiktok_client_key: TT_ON ? TT_KEY : undefined }));

    app.post('/api/auth/request', async (req, res) => {
        if (provider !== 'gateway') return res.status(503).json({ status: 'disabled' });
        const name = String((req.body && req.body.name) || '').trim().slice(0, 100);
        const phone = canonPhone(req.body && req.body.phone);
        if (!name) return res.status(400).json({ status: 'bad_name' });
        if (!phone) return res.status(400).json({ status: 'bad_phone' });
        if (limited('ip:' + req.ip, 12, 10 * 60 * 1000) || limited('ph:' + phone, 5, 60 * 60 * 1000))
            return res.status(429).json({ status: 'too_many' });
        try {
            const prev = await pool.query("SELECT sent_at FROM customer_otps WHERE phone = $1", [phone]);
            if (prev.rows.length && Date.now() - new Date(prev.rows[0].sent_at).getTime() < 30000)
                return res.status(429).json({ status: 'wait' });

            const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
            const sent = await sendCode(phone, code);
            if (!sent.ok) {
                console.error('gateway send failed:', phone.slice(0, 5) + '***', sent.error);
                if (/PHONE_NUMBER_NOT_OCCUPIED|PHONE_NUMBER_INVALID|PHONE_NUMBER_NOT/.test(sent.error))
                    return res.json({ status: 'no_telegram' });
                if (/BALANCE|FUNDS|PAYMENT/.test(sent.error))
                    console.error('⚠ Telegram Gateway balance is empty — top up at gateway.telegram.org');
                return res.status(502).json({ status: 'send_failed' });
            }
            await pool.query(
                `INSERT INTO customer_otps (phone, name, code_hash, attempts, sent_at, expires_at)
                 VALUES ($1, $2, $3, 0, NOW(), NOW() + make_interval(secs => $4))
                 ON CONFLICT (phone) DO UPDATE SET name = $2, code_hash = $3, attempts = 0, sent_at = NOW(), expires_at = NOW() + make_interval(secs => $4)`,
                [phone, name, sha(SECRET + phone + code), OTP_TTL_SEC]);
            res.json({ status: 'sent' });
        } catch (e) {
            console.error('auth/request:', e.message);
            res.status(500).json({ status: 'error' });
        }
    });

    app.post('/api/auth/verify', async (req, res) => {
        if (provider !== 'gateway') return res.status(503).json({ ok: false });
        const phone = canonPhone(req.body && req.body.phone);
        const code = String((req.body && req.body.code) || '').trim();
        if (!phone || !/^\d{4}$/.test(code)) return res.status(400).json({ ok: false, error: 'bad_code' });
        if (limited('vip:' + req.ip, 30, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'too_many' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const r = await client.query("SELECT * FROM customer_otps WHERE phone = $1 FOR UPDATE", [phone]);
            const o = r.rows[0];
            if (!o || new Date(o.expires_at) < new Date()) { await client.query('ROLLBACK'); return res.json({ ok: false, error: 'expired' }); }
            if (o.attempts >= OTP_MAX_TRIES) { await client.query('ROLLBACK'); return res.json({ ok: false, error: 'locked' }); }
            const a = Buffer.from(sha(SECRET + phone + code)), b = Buffer.from(o.code_hash);
            if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) {
                await client.query("UPDATE customer_otps SET attempts = attempts + 1 WHERE phone = $1", [phone]);
                await client.query('COMMIT');
                return res.json({ ok: false, error: 'wrong', left: Math.max(0, OTP_MAX_TRIES - o.attempts - 1) });
            }
            await client.query("DELETE FROM customer_otps WHERE phone = $1", [phone]);
            const cu = await client.query(
                `INSERT INTO customers (phone, name) VALUES ($1, $2)
                 ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF($2, ''), customers.name), last_login_at = NOW()
                 RETURNING id, name, phone`, [phone, o.name]);
            const token = crypto.randomBytes(32).toString('base64url');
            await client.query(
                `INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))`,
                [sha(token), cu.rows[0].id, SESSION_DAYS]);
            await client.query('COMMIT');
            res.json({ ok: true, token, customer: publicCustomer(await fullCustomer(cu.rows[0].id)) });
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (_) {}
            console.error('auth/verify:', e.message);
            res.status(500).json({ ok: false, error: 'error' });
        } finally { client.release(); }
    });


    // ---------- "Log in with Telegram" (OpenID Connect, code flow + PKCE) ----------
    let jwks = { keys: null, at: 0 };
    async function getJwks(force) {
        if (!force && jwks.keys && Date.now() - jwks.at < 3600000) return jwks.keys;
        const r = await fetch('https://oauth.telegram.org/.well-known/jwks.json');
        const j = await r.json();
        jwks = { keys: j.keys || [], at: Date.now() };
        return jwks.keys;
    }
    const b64u = (s) => Buffer.from(s, 'base64url');
    async function verifyIdToken(idToken) {
        const parts = String(idToken || '').split('.');
        if (parts.length !== 3) throw new Error('bad token');
        const header = JSON.parse(b64u(parts[0]).toString());
        const claims = JSON.parse(b64u(parts[1]).toString());
        let keys = await getJwks(false);
        let jwk = keys.find(k => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
        if (!jwk) { keys = await getJwks(true); jwk = keys.find(k => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null); }
        if (!jwk) throw new Error('no matching key');
        const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        const data = Buffer.from(parts[0] + '.' + parts[1]);
        const sig = b64u(parts[2]);
        let ok = false;
        if (header.alg === 'RS256') ok = crypto.verify('RSA-SHA256', data, pub, sig);
        else if (header.alg === 'ES256') ok = crypto.verify('sha256', data, { key: pub, dsaEncoding: 'ieee-p1363' }, sig);
        else if (header.alg === 'EdDSA') ok = crypto.verify(null, data, pub, sig);
        else throw new Error('unsupported alg ' + header.alg);
        if (!ok) throw new Error('bad signature');
        const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (claims.iss !== 'https://oauth.telegram.org') throw new Error('bad iss');
        if (!aud.map(String).includes(TG_ID)) throw new Error('bad aud');
        if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('expired');
        return claims;
    }

    app.post('/api/auth/telegram', async (req, res) => {
        if (provider !== 'telegram') return res.status(503).json({ ok: false, error: 'disabled' });
        if (limited('tg:' + req.ip, 20, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'too_many' });
        const b = req.body || {};
        const code = String(b.code || ''), verifier = String(b.code_verifier || ''), redirect = String(b.redirect_uri || '');
        if (!/^[\w.~-]{10,2000}$/.test(code) || !/^[\w.~-]{43,128}$/.test(verifier) || !/^https:\/\/[^\s]{3,300}$/.test(redirect))
            return res.status(400).json({ ok: false, error: 'bad_request' });
        try {
            const tr = await fetch('https://oauth.telegram.org/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' + Buffer.from(TG_ID + ':' + TG_SECRET).toString('base64')
                },
                body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: TG_ID, code_verifier: verifier }).toString()
            });
            const tj = await tr.json().catch(() => ({}));
            if (!tr.ok || !tj.id_token) { console.error('tg token exchange failed:', tr.status, JSON.stringify(tj).slice(0, 200)); return res.status(400).json({ ok: false, error: 'exchange_failed' }); }
            const claims = await verifyIdToken(tj.id_token);
            const phone = canonPhone(claims.phone_number);
            if (!phone) return res.json({ ok: false, error: 'no_phone' });
            const name = String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || claims.preferred_username || '').trim().slice(0, 100);
            const tgId = /^\d{1,18}$/.test(String(claims.id || claims.sub)) ? String(claims.id || claims.sub) : null;
            const cu = await pool.query(
                `INSERT INTO customers (phone, name, tg_id) VALUES ($1, $2, $3)
                 ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF($2, ''), customers.name), tg_id = COALESCE($3, customers.tg_id), last_login_at = NOW()
                 RETURNING id, name, phone`, [phone, name, tgId]);
            await setPicture(cu.rows[0].id, claims.picture);
            const token = crypto.randomBytes(32).toString('base64url');
            await pool.query(`INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))`,
                [sha(token), cu.rows[0].id, SESSION_DAYS]);
            res.json({ ok: true, token, customer: publicCustomer(await fullCustomer(cu.rows[0].id)) });
        } catch (e) {
            console.error('auth/telegram:', e.message);
            res.status(400).json({ ok: false, error: 'invalid' });
        }
    });

    // ---------- Google (Gmail) login: verify the ID token from Google Identity Services ----------
    let gJwks = { keys: null, at: 0 };
    async function getGoogleKeys(force) {
        if (!force && gJwks.keys && Date.now() - gJwks.at < 3600000) return gJwks.keys;
        const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
        const j = await r.json();
        gJwks = { keys: j.keys || [], at: Date.now() };
        return gJwks.keys;
    }
    async function verifyGoogleToken(idToken) {
        const parts = String(idToken || '').split('.');
        if (parts.length !== 3) throw new Error('bad token');
        const header = JSON.parse(b64u(parts[0]).toString());
        const claims = JSON.parse(b64u(parts[1]).toString());
        if (header.alg !== 'RS256') throw new Error('unsupported alg');
        let keys = await getGoogleKeys(false);
        let jwk = keys.find(k => k.kid === header.kid);
        if (!jwk) { keys = await getGoogleKeys(true); jwk = keys.find(k => k.kid === header.kid); }
        if (!jwk) throw new Error('no matching key');
        const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        if (!crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), pub, b64u(parts[2]))) throw new Error('bad signature');
        if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('bad iss');
        if (String(claims.aud) !== GOOGLE_ID) throw new Error('bad aud');
        if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('expired');
        if (!claims.sub || !claims.email || !(claims.email_verified === true || claims.email_verified === 'true')) throw new Error('email not verified');
        return claims;
    }

    app.post('/api/auth/google', async (req, res) => {
        if (!GOOGLE_ID) return res.status(503).json({ ok: false, error: 'disabled' });
        if (limited('gg:' + req.ip, 20, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'too_many' });
        try {
            const claims = await verifyGoogleToken(req.body && req.body.credential);
            const sub = String(claims.sub).slice(0, 64);
            const email = String(claims.email).toLowerCase().slice(0, 255);
            const name = String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || email.split('@')[0]).trim().slice(0, 100);
            // same Google account (sub) or same verified Gmail = same customer
            let cu = await pool.query(`SELECT id FROM customers WHERE google_sub = $1 OR LOWER(email) = $2 ORDER BY (google_sub = $1) DESC LIMIT 1`, [sub, email]);
            if (cu.rows.length) {
                cu = await pool.query(
                    `UPDATE customers SET google_sub = COALESCE(google_sub, $2), email = COALESCE(email, $3),
                     name = COALESCE(NULLIF(name, ''), $4), last_login_at = NOW() WHERE id = $1 RETURNING id, name, phone, email`,
                    [cu.rows[0].id, sub, email, name]);
            } else {
                cu = await pool.query(
                    `INSERT INTO customers (phone, name, email, google_sub) VALUES (NULL, $1, $2, $3) RETURNING id, name, phone, email`,
                    [name, email, sub]);
            }
            await setPicture(cu.rows[0].id, claims.picture);
            const token = crypto.randomBytes(32).toString('base64url');
            await pool.query(`INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))`,
                [sha(token), cu.rows[0].id, SESSION_DAYS]);
            res.json({ ok: true, token, customer: publicCustomer(await fullCustomer(cu.rows[0].id)) });
        } catch (e) {
            console.error('auth/google:', e.message);
            res.status(400).json({ ok: false, error: 'invalid' });
        }
    });


    // ---------- edit own profile (name / photo) ----------
    app.post('/api/my/profile', async (req, res) => {
        const c = await authCustomer(req);
        if (!c) return res.status(401).json({ ok: false, error: 'need_login' });
        if (limited('prof:' + c.id, 30, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'too_many' });
        const b = req.body || {};
        const sets = [], vals = [];
        if (b.name !== undefined) {
            const name = String(b.name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
            if (!name) return res.status(400).json({ ok: false, error: 'bad_name' });
            vals.push(name); sets.push('name = $' + vals.length);
        }
        if (b.avatar !== undefined) {
            const a = String(b.avatar);
            if (a === '') { vals.push(null); sets.push('avatar = $' + vals.length); }
            else if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a) && a.length <= 70000) { vals.push(a); sets.push('avatar = $' + vals.length); }
            else return res.status(400).json({ ok: false, error: 'bad_avatar' });
        }
        if (!sets.length) return res.status(400).json({ ok: false, error: 'nothing' });
        try {
            vals.push(c.id);
            await pool.query('UPDATE customers SET ' + sets.join(', ') + ' WHERE id = $' + vals.length, vals);
            res.json({ ok: true, customer: publicCustomer(await fullCustomer(c.id)) });
        } catch (e) { console.error('my/profile:', e.message); res.status(500).json({ ok: false }); }
    });

    // ---------- Continue with TikTok (Login Kit, web) ----------
    app.post('/api/auth/tiktok', async (req, res) => {
        if (!TT_ON) return res.status(503).json({ ok: false, error: 'disabled' });
        if (limited('tt:' + req.ip, 20, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'too_many' });
        const b = req.body || {};
        const code = String(b.code || ''), redirect = String(b.redirect_uri || '');
        if (!/^\S{10,2000}$/.test(code) || !/^https:\/\/[^\s]{3,300}$/.test(redirect))
            return res.status(400).json({ ok: false, error: 'bad_request' });
        try {
            const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
                body: new URLSearchParams({ client_key: TT_KEY, client_secret: TT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirect }).toString()
            });
            const tj = await tr.json().catch(() => ({}));
            if (!tj.access_token) { console.error('tiktok token exchange failed:', tr.status, JSON.stringify(tj).slice(0, 200)); return res.status(400).json({ ok: false, error: 'exchange_failed' }); }
            const ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name', {
                headers: { Authorization: 'Bearer ' + tj.access_token }
            });
            const uj = await ur.json().catch(() => ({}));
            const user = (uj && uj.data && uj.data.user) || {};
            const openId = String(user.open_id || tj.open_id || '').slice(0, 64);
            if (!openId) { console.error('tiktok user info failed:', ur.status, JSON.stringify(uj).slice(0, 200)); return res.status(400).json({ ok: false, error: 'no_user' }); }
            const name = String(user.display_name || 'TikTok user').trim().slice(0, 100);
            let cu = await pool.query('SELECT id FROM customers WHERE tiktok_open_id = $1', [openId]);
            if (cu.rows.length) {
                cu = await pool.query(`UPDATE customers SET name = COALESCE(NULLIF(name, ''), $2), last_login_at = NOW() WHERE id = $1 RETURNING id`, [cu.rows[0].id, name]);
            } else {
                cu = await pool.query(`INSERT INTO customers (phone, name, tiktok_open_id) VALUES (NULL, $1, $2) RETURNING id`, [name, openId]);
            }
            await setPicture(cu.rows[0].id, user.avatar_url);
            const token = crypto.randomBytes(32).toString('base64url');
            await pool.query(`INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))`,
                [sha(token), cu.rows[0].id, SESSION_DAYS]);
            res.json({ ok: true, token, customer: publicCustomer(await fullCustomer(cu.rows[0].id)) });
        } catch (e) {
            console.error('auth/tiktok:', e.message);
            res.status(400).json({ ok: false, error: 'invalid' });
        }
    });

    app.get('/api/auth/me', async (req, res) => {
        const c = await authCustomer(req);
        if (!c) return res.status(401).json({ ok: false });
        res.json({ ok: true, customer: publicCustomer(c) });
    });

    app.post('/api/auth/logout', async (req, res) => {
        const tok = bearer(req);
        if (tok) pool.query("DELETE FROM customer_sessions WHERE token_hash = $1", [sha(tok)]).catch(() => {});
        res.json({ ok: true });
    });

    // paid | unpaid (waiting for KHQR) | cod (pay on delivery) | cancelled | expired
    function payState(o) {
        if (o.status === 'CANCELLED') return 'cancelled';
        if (o.status === 'EXPIRED') return 'expired';
        if (o.status === 'AWAITING_PAYMENT') return 'unpaid';
        if (o.payment_method === 'KHQR' && o.paid_at) return 'paid';
        return o.payment_method === 'KHQR' ? 'paid' : 'cod';
    }

    app.get('/api/my/orders', async (req, res) => {
        const c = await authCustomer(req);
        if (!c) return res.status(401).json({ ok: false });
        try {
            const r = await pool.query(
                `SELECT id, items, total, status, payment_method, pay_amount, paid_at, created_at
                 FROM orders WHERE customer_id = $1 ORDER BY id DESC LIMIT 50`, [c.id]);
            res.json({
                ok: true,
                orders: r.rows.map(o => {
                    const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
                    return {
                        id: o.id, created_at: o.created_at, status: o.status, pay: payState(o),
                        method: o.payment_method, total: Number(o.total), pay_amount: o.pay_amount == null ? null : Number(o.pay_amount),
                        items: (Array.isArray(items) ? items : Object.values(items)).map(i => ({
                            ref: i.ref, title: i.title || i.titleKey || '', size: i.size, qty: i.qty, price: Number(i.price) || 0
                        }))
                    };
                })
            });
        } catch (e) {
            console.error('my/orders:', e.message);
            res.status(500).json({ ok: false });
        }
    });

    return { enabled, authCustomer, provider };
};
