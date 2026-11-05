// Bakong KHQR helper: generate a dynamic KHQR and check whether it was paid.
// All secrets come from environment variables (set them on Railway), never in code.
//
//   BAKONG_TOKEN          API token from https://api-bakong.nbc.gov.kh (renew before it expires)
//   BAKONG_ACCOUNT_ID     your Bakong account id, e.g. yourname@aclb
//   BAKONG_MERCHANT_NAME  shown to the customer in their banking app
//   BAKONG_MERCHANT_CITY  optional, default "Phnom Penh"
//   BAKONG_API_URL        optional, default https://api-bakong.nbc.gov.kh

const BASE_URL = (process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/+$/, '');

// ---------------- API call budget ----------------
// Bakong allows only ~100 calls/day per token. Every call goes through allow()/post() so we can never burn it blindly.
//   BAKONG_DAILY_LIMIT  daily cap given by Bakong (default 100)
//   BAKONG_RESERVE      calls kept back for manual / last-chance checks that background polling may not touch (default 10)
const DAILY_LIMIT = Number(process.env.BAKONG_DAILY_LIMIT) || 100;
const RESERVE = process.env.BAKONG_RESERVE !== undefined && Number.isFinite(Number(process.env.BAKONG_RESERVE)) ? Number(process.env.BAKONG_RESERVE) : 10;
const QUOTA_BLOCK_MS = 30 * 60 * 1000; // after a "limit exceeded" answer, stop calling and probe again every 30 min (we do not know exactly when Bakong resets)
const SHORT_BLOCK_MS = 60 * 1000;      // plain HTTP 429 (too fast)

let db = null;
const usage = { day: '', calls: 0, blockedUntil: 0 };

function phnomPenhDay() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function rollDay() {
    const d = phnomPenhDay();
    if (usage.day !== d) { usage.day = d; usage.calls = 0; usage.blockedUntil = 0; persist(); }
}
function persist() {
    if (!db) return;
    db.query(
        `INSERT INTO bakong_usage (id, day, calls, blocked_until) VALUES (1, $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET day = EXCLUDED.day, calls = EXCLUDED.calls, blocked_until = EXCLUDED.blocked_until`,
        [usage.day, usage.calls, usage.blockedUntil]
    ).catch(() => {});
}

// Call once at startup so the counter survives Railway restarts/redeploys.
async function init(pool) {
    db = pool;
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS bakong_usage (id INT PRIMARY KEY, day TEXT, calls INT DEFAULT 0, blocked_until BIGINT DEFAULT 0)`);
        const r = await pool.query('SELECT day, calls, blocked_until FROM bakong_usage WHERE id = 1');
        if (r.rows.length) {
            usage.day = r.rows[0].day || '';
            usage.calls = Number(r.rows[0].calls) || 0;
            usage.blockedUntil = Number(r.rows[0].blocked_until) || 0;
        }
        rollDay();
    } catch (e) { console.error('bakong usage init error:', e.message); }
}

// priority: 'auto' = background polling (must leave RESERVE calls untouched); 'manual' / 'final' may use the reserve.
function allow(priority) {
    rollDay();
    if (Date.now() < usage.blockedUntil) return false;
    return usage.calls < (priority === 'auto' ? DAILY_LIMIT - RESERVE : DAILY_LIMIT);
}
function degraded() { return !allow('auto'); }
function status() { rollDay(); return { used: usage.calls, limit: DAILY_LIMIT, blocked: Date.now() < usage.blockedUntil, blockedUntil: usage.blockedUntil }; }
function block(ms) { usage.blockedUntil = Date.now() + ms; persist(); }

// The only place that talks to Bakong. Counts every call that actually got an HTTP answer.
async function post(path, payload) {
    let res;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BAKONG_TOKEN}` },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000)
        });
    } catch (err) {
        return { error: 'network: ' + err.message };
    }
    rollDay();
    usage.calls++;
    persist();
    let body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON body */ }
    return { res, body };
}

function isQuotaMessage(body) {
    return /daily request limit|limit of \d+ exceeded|request limit/i.test(String((body && (body.responseMessage || body.message)) || ''));
}

function isEnabled() {
    return Boolean(process.env.BAKONG_TOKEN && process.env.BAKONG_ACCOUNT_ID && process.env.BAKONG_MERCHANT_NAME);
}

/**
 * Create a dynamic USD KHQR for one order.
 * @returns {{ qr: string, md5: string }}
 */
function createKhqr({ amount, billNumber, expiresAt }) {
    // Required lazily so the server still boots (COD only) if the package is missing.
    const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

    const info = new IndividualInfo(
        process.env.BAKONG_ACCOUNT_ID,
        process.env.BAKONG_MERCHANT_NAME,
        process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh',
        {
            currency: khqrData.currency.usd,
            amount: Number(Number(amount).toFixed(2)),
            billNumber: String(billNumber),
            expirationTimestamp: expiresAt
        }
    );

    const result = new BakongKHQR().generateIndividual(info);
    if (!result || !result.data || !result.data.qr || !result.data.md5) {
        const why = result && result.status ? `${result.status.code} ${result.status.message}` : 'unknown';
        throw new Error('KHQR generation failed: ' + why);
    }
    return { qr: result.data.qr, md5: result.data.md5 };
}

/**
 * Standalone KHQR for the "free QR" page. Touches NO order, NO stock, NO database and NO Bakong API call.
 *  - no amount  -> static QR: never expires, the payer types the amount, can be paid any number of times
 *  - with amount -> dynamic QR that expires after `days` days (Bakong requires an expiry for QRs with an amount)
 * Nothing is tracked afterwards: the owner confirms the payment in the banking app.
 */
function createStandaloneKhqr({ amount, note, days }) {
    const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');
    const amt = Number(amount);
    const hasAmount = Number.isFinite(amt) && amt > 0;
    const opts = { currency: khqrData.currency.usd };
    const bill = String(note || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 25);
    if (bill) opts.billNumber = bill;
    if (hasAmount) {
        opts.amount = Number(amt.toFixed(2));
        const d = Math.min(30, Math.max(1, Math.floor(Number(days) || 1)));
        opts.expirationTimestamp = Date.now() + d * 24 * 3600 * 1000;
    }
    const info = new IndividualInfo(
        process.env.BAKONG_ACCOUNT_ID,
        process.env.BAKONG_MERCHANT_NAME,
        process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh',
        opts
    );
    const result = new BakongKHQR().generateIndividual(info);
    if (!result || !result.data || !result.data.qr) {
        const why = result && result.status ? `${result.status.code} ${result.status.message}` : 'unknown';
        throw new Error('KHQR generation failed: ' + why);
    }
    return { qr: result.data.qr, dynamic: hasAmount, expires_at: opts.expirationTimestamp || null };
}

/**
 * Ask Bakong whether the QR with this md5 has been paid (1 API call).
 * @returns {Promise<{ state: 'PAID'|'UNPAID'|'QUOTA'|'ERROR', detail?: string }>}
 *   QUOTA = we are out of calls (or blocked); the real answer is UNKNOWN, never treat it as "unpaid".
 */
async function checkPaid(md5, expectedAmount, priority = 'auto') {
    if (!allow(priority)) return { state: 'QUOTA', detail: 'Bakong daily call budget used up' };
    const r = await post('/v1/check_transaction_by_md5', { md5 });
    return interpret(r, expectedAmount);
}

function interpret(r, expectedAmount) {
    if (r.error) return { state: 'ERROR', detail: r.error };
    const { res, body } = r;

    if (res.status === 429 || isQuotaMessage(body)) {
        const daily = isQuotaMessage(body);
        if (daily) usage.calls = Math.max(usage.calls, DAILY_LIMIT);
        block(daily ? QUOTA_BLOCK_MS : SHORT_BLOCK_MS);
        return { state: 'QUOTA', detail: (body && body.responseMessage) || `HTTP ${res.status}` };
    }
    // 401/403 = token expired/invalid or request blocked (Bakong may only accept Cambodian IPs)
    if (res.status === 401 || res.status === 403) {
        return { state: 'ERROR', detail: `HTTP ${res.status} (token expired, or the server IP is blocked by Bakong)` };
    }
    if (res.status >= 500) return { state: 'ERROR', detail: `HTTP ${res.status} (Bakong busy)` };
    if (!body) return { state: 'ERROR', detail: `HTTP ${res.status} with no JSON` };

    if (body.responseCode === 0 && body.data) return paidOrUnderpaid(body.data, expectedAmount);

    // "Transaction could not be found" = simply not paid yet (Bakong sends errorCode 1 or 3 depending on the case)
    if (body.responseCode === 1 && /could not be found/i.test(String(body.responseMessage || ''))) return { state: 'UNPAID' };

    return { state: 'ERROR', detail: `${body.responseCode}/${body.errorCode}: ${body.responseMessage || ''}` };
}

function paidOrUnderpaid(data, expectedAmount) {
    // The amount is locked inside the QR, so a found transaction is the right amount. Only reject when Bakong
    // clearly reports a smaller positive amount; a missing/zero amount field must not block a real payment.
    const paid = Number(data.amount);
    if (expectedAmount !== undefined && Number.isFinite(paid) && paid > 0 && paid + 0.005 < Number(expectedAmount)) {
        return { state: 'ERROR', detail: `underpaid: got ${paid}, expected ${expectedAmount}` };
    }
    return { state: 'PAID' };
}

let listSupported = true;

/**
 * Check SEVERAL orders with ONE API call (check_transaction_by_md5_list, up to 50 md5 per call).
 * @param {{md5: string, amount?: number}[]} items
 * @returns {Promise<Map<string, {state: string, detail?: string}>>}
 * Falls back to one call per order if Bakong rejects the list endpoint.
 */
async function checkPaidBatch(items, priority = 'auto') {
    const out = new Map();
    items = items.slice(0, 50);
    if (items.length === 0) return out;

    if (items.length === 1 || !listSupported) {
        for (const it of items) out.set(it.md5, await checkPaid(it.md5, it.amount, priority));
        return out;
    }
    if (!allow(priority)) {
        items.forEach(it => out.set(it.md5, { state: 'QUOTA', detail: 'Bakong daily call budget used up' }));
        return out;
    }

    const r = await post('/v1/check_transaction_by_md5_list', items.map(it => it.md5));
    if (r.error) { items.forEach(it => out.set(it.md5, { state: 'ERROR', detail: r.error })); return out; }

    if (r.res.status === 404 || r.res.status === 405) {
        listSupported = false;
        console.error('Bakong list endpoint not available, falling back to single checks');
        for (const it of items) out.set(it.md5, await checkPaid(it.md5, it.amount, priority));
        return out;
    }
    if (r.res.status === 429 || isQuotaMessage(r.body)) {
        const q = interpret(r, undefined); // sets the block
        items.forEach(it => out.set(it.md5, q));
        return out;
    }
    const body = r.body;
    if (r.res.status === 200 && body && body.responseCode === 0 && Array.isArray(body.data)) {
        const found = new Map(body.data.map(d => [String(d.md5 || '').toLowerCase(), d]));
        for (const it of items) {
            const d = found.get(it.md5.toLowerCase());
            out.set(it.md5, d ? paidOrUnderpaid(d, it.amount) : { state: 'UNPAID' });
        }
        return out;
    }
    // "not found" style answer for the whole list = nobody has paid
    if (body && body.responseCode === 1 && /could not be found/i.test(String(body.responseMessage || ''))) {
        items.forEach(it => out.set(it.md5, { state: 'UNPAID' }));
        return out;
    }
    const detail = r.res.status >= 401 && r.res.status <= 403
        ? `HTTP ${r.res.status} (token expired, or the server IP is blocked by Bakong)`
        : `list check: HTTP ${r.res.status} ${body ? body.responseCode + '/' + body.errorCode + ': ' + (body.responseMessage || '') : ''}`;
    items.forEach(it => out.set(it.md5, { state: 'ERROR', detail }));
    return out;
}

module.exports = { isEnabled, createKhqr, createStandaloneKhqr, checkPaid, checkPaidBatch, init, allow, degraded, status };
