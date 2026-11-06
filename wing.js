// Wing Bank "OnlineSDK-KHQR" v4: create a web KHQR payment page and check whether it was paid.
// Based on the OpenAPI file Wing published in the OpenAPI Marketplace.
//
//   WING_CLIENT_ID        from Wing (OpenAPI Marketplace credential email)
//   WING_CLIENT_SECRET    from Wing
//   WING_MERCHANT_NAME    optional, shown to the customer (falls back to BAKONG_MERCHANT_NAME)
//   WING_RETURN_URL       optional, where Wing sends the customer after paying (default: your Railway site)
//   WING_API_URL          optional, default https://prodint-gateway.wingbank.com.kh

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');

const HOST = (process.env.WING_API_URL || 'https://prodint-gateway.wingbank.com.kh').replace(/\/+$/, '');
const SERVICE = HOST + '/onlinesdk-khqr/v4';
const DEVICE_ID = crypto.randomUUID(); // keeps Wing from revoking the token early (per their docs)

let tokenCache = { token: null, expiresAt: 0 };

// ---------------------------------------------------------------------------------------------------------------
// Network diagnosis. Runs once at startup and (at most every 5 minutes) after a failed Wing call, and prints a
// plain verdict in the Railway Deploy Logs: look for lines starting with [WING-DIAG].
// ---------------------------------------------------------------------------------------------------------------
function causeText(err) {
    const c = (err && err.cause) || err || {};
    return [c.code, c.syscall, c.address ? (c.address + (c.port ? ':' + c.port : '')) : '', c.message && !c.code ? c.message : '']
        .filter(Boolean).join(' ');
}

function step(name, fn) {
    const t0 = Date.now();
    return Promise.resolve().then(fn).then(
        (info) => ({ name, ok: true, ms: Date.now() - t0, info: info || '' }),
        (err) => ({ name, ok: false, ms: Date.now() - t0, info: causeText(err) || String(err && err.message || err) })
    );
}

function tcpConnect(host, port, ms) {
    return new Promise((resolve, reject) => {
        const sock = net.connect({ host, port });
        const timer = setTimeout(() => { sock.destroy(); reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })); }, ms);
        sock.once('connect', () => { clearTimeout(timer); sock.end(); resolve(`connected to ${sock.remoteAddress}:${port}`); });
        sock.once('error', (e) => { clearTimeout(timer); reject(e); });
    });
}

function tlsHandshake(host, port, ms) {
    return new Promise((resolve, reject) => {
        const sock = tls.connect({ host, port, servername: host });
        const timer = setTimeout(() => { sock.destroy(); reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })); }, ms);
        sock.once('secureConnect', () => { clearTimeout(timer); const v = sock.getProtocol(); sock.end(); resolve(v); });
        sock.once('error', (e) => { clearTimeout(timer); reject(e); });
    });
}

let lastDiagAt = 0;
let diagRunning = false;
async function diagnose(reason) {
    if (diagRunning) return;
    diagRunning = true;
    lastDiagAt = Date.now();
    try {
        const host = new URL(HOST).hostname;
        const out = [];
        const log = (...a) => console.log('[WING-DIAG]', ...a);
        log(`start (${reason || 'manual'}) target=${host}`);

        const ip = await step('my public IP (give this to Wing for whitelist)', async () => {
            const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(6000) });
            return (await r.text()).trim();
        });
        const dnsR = await step('DNS lookup', async () => {
            const r = await dns.lookup(host, { all: true });
            return r.map(x => x.address).join(', ');
        });
        const tcpR = dnsR.ok ? await step('TCP connect :443', () => tcpConnect(host, 443, 6000)) : null;
        const tlsR = tcpR && tcpR.ok ? await step('TLS handshake', () => tlsHandshake(host, 443, 6000)) : null;
        const httpR = tlsR && tlsR.ok ? await step('HTTPS request', async () => {
            const r = await fetch(HOST, { signal: AbortSignal.timeout(8000) });
            return 'HTTP ' + r.status;
        }) : null;

        for (const r of [ip, dnsR, tcpR, tlsR, httpR]) {
            if (r) log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}: ${r.info} (${r.ms} ms)`);
            else out.push('skipped');
        }

        let verdict;
        if (!dnsR.ok) verdict = 'DNS cannot resolve the Wing host. Check WING_API_URL spelling or Railway DNS/network.';
        else if (!tcpR.ok && /TIMEOUT|ETIMEDOUT/.test(tcpR.info)) verdict = 'TCP connection times out: a firewall is silently dropping packets from this server. Most likely Wing only allows whitelisted IPs, or Railway has a network problem. Send the public IP above to Wing.';
        else if (!tcpR.ok && /ECONNREFUSED/.test(tcpR.info)) verdict = 'Port 443 refused: wrong host/URL, or Wing gateway is down.';
        else if (!tcpR.ok) verdict = 'TCP connection failed (' + tcpR.info + '): network path to Wing is blocked.';
        else if (!tlsR.ok && /ECONNRESET/.test(tlsR.info)) verdict = 'TCP connects but Wing resets the connection during TLS: Wing is rejecting this server (IP not whitelisted or country/IP block). Send the public IP above to Wing. It is NOT a code or credentials problem.';
        else if (!tlsR.ok) verdict = 'TLS handshake failed (' + tlsR.info + ').';
        else if (!httpR.ok) verdict = 'TLS works but the HTTPS request fails (' + httpR.info + '): Wing resets after connect, likely IP/WAF block.';
        else verdict = 'Network path to Wing is OK (' + httpR.info + '). If orders still fail, the problem is the request itself (credentials, hash, URL path).';
        if (!ip.ok) verdict += ' (Also: general outbound internet check failed, so Railway outbound network may be broken.)';
        log('VERDICT:', verdict);
    } catch (e) {
        console.log('[WING-DIAG] diagnose crashed:', e && e.message);
    } finally {
        diagRunning = false;
    }
}

function scheduleDiag(reason) {
    if (Date.now() - lastDiagAt < 5 * 60 * 1000) return;
    diagnose(reason).catch(() => {});
}

// Circuit breaker: if Wing cannot be reached (ECONNRESET, timeout, DNS...), stop offering Wing for a few minutes
// so customers use KHQR (Bakong) instead of hitting an error. It resets by itself after the pause.
const DOWN_PAUSE_MS = 3 * 60 * 1000;
let downUntil = 0;

// Node's fetch only says "fetch failed"; the real reason (DNS, timeout, refused, TLS) is in err.cause.
async function wfetch(url, opts) {
    try {
        const res = await fetch(url, opts);
        downUntil = 0; // Wing answered, so the network path works
        return res;
    } catch (err) {
        downUntil = Date.now() + DOWN_PAUSE_MS;
        const c = causeText(err);
        const e = new Error(`cannot reach Wing (${new URL(url).host}): ${err.message}${c ? ' - ' + c : ''}`);
        e.wingNetwork = true;
        scheduleDiag('failed call to ' + new URL(url).pathname);
        throw e;
    }
}

function isEnabled() {
    return Boolean(process.env.WING_CLIENT_ID && process.env.WING_CLIENT_SECRET);
}

// Enabled AND not paused because of a recent network failure. Use this to decide whether to offer Wing to customers.
function isAvailable() {
    return isEnabled() && Date.now() >= downUntil;
}

// AES-256-GCM exactly as the docs describe: IV = first 12 chars of client_id,
// key = client_id padded/truncated to 32 chars. Output = base64(ciphertext + auth tag).
function aesGcmRaw(plain, clientId) {
    if (clientId.length < 12) throw new Error('WING_CLIENT_ID is too short (needs at least 12 characters)');
    const iv = Buffer.from(clientId.slice(0, 12), 'utf8');
    const key = Buffer.from(clientId.padEnd(32, '0').slice(0, 32), 'utf8');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return { body, tag: cipher.getAuthTag() };
}
function aesGcmBase64(plain, clientId) {
    const { body, tag } = aesGcmRaw(plain, clientId);
    return Buffer.concat([body, tag]).toString('base64');
}

// X-Payload-Hash = SHA256( B64( AES256( B64( client_id#amount#currency#order_ref#return_url#cancel_url#timestamp ) ) ) )
function payloadHash({ clientId, amount, currency, orderRef, returnUrl, cancelUrl, timestamp }) {
    const joined = [clientId, amount, currency, orderRef, returnUrl, cancelUrl, timestamp].join('#');
    const step2 = Buffer.from(joined, 'utf8').toString('base64');
    const step4 = aesGcmBase64(step2, clientId);
    return crypto.createHash('sha256').update(step4).digest('hex');
}

// Wing answered "Invalid hash" for the documented recipe, so we also try a few close variants (and the optional
// WING_CIPHER_KEY from the credential PDF) and remember whichever one Wing accepts.
let winningHash = null;
function hashCandidates({ clientId, amount, currency, orderRef, returnUrl, cancelUrl, timestamp }) {
    const joined = [clientId, amount, currency, orderRef, returnUrl, cancelUrl, timestamp].join('#');
    const b64 = Buffer.from(joined, 'utf8').toString('base64');
    const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
    const keys = [['client_id', clientId]];
    if (process.env.WING_CIPHER_KEY) keys.push(['cipher_key', process.env.WING_CIPHER_KEY.trim()]);
    const out = [];
    for (const [kn, k] of keys) {
        const a = aesGcmRaw(b64, k);          // documented: AES(B64(joined))
        const b = aesGcmRaw(joined, k);       // without the inner base64
        out.push({ name: `${kn}/doc`,          hash: sha(Buffer.concat([a.body, a.tag]).toString('base64')) });
        out.push({ name: `${kn}/no-tag`,       hash: sha(a.body.toString('base64')) });
        out.push({ name: `${kn}/raw-bytes`,    hash: sha(Buffer.concat([a.body, a.tag])) });
        out.push({ name: `${kn}/no-inner-b64`, hash: sha(Buffer.concat([b.body, b.tag]).toString('base64')) });
    }
    if (winningHash) out.sort((x, y) => (y.name === winningHash) - (x.name === winningHash));
    return out;
}

async function getToken(force) {
    if (!force && tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.WING_CLIENT_ID,
        client_secret: process.env.WING_CLIENT_SECRET,
        scope: `partner:standard device_id:${DEVICE_ID}`
    });
    const res = await wfetch(HOST + '/idp/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(6000)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.access_token) {
        throw new Error(`Wing token failed: HTTP ${res.status} ${json ? (json.error_description || json.error || '') : ''}`);
    }
    // token lives 60 minutes; refresh a bit early
    tokenCache = { token: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in || 3600) - 120) * 1000 };
    return tokenCache.token;
}

/**
 * Create the Wing web payment page for one order.
 * @returns {Promise<{ url: string }>}
 */
async function createPayment({ amount, orderRef, returnUrl, cancelUrl, merchantName }) {
    const clientId = process.env.WING_CLIENT_ID;
    const amountStr = Number(amount).toFixed(2);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const currency = 'USD';

    const payload = {
        amount: amountStr,
        currency,
        order_reference_no: orderRef,
        return_url: returnUrl,
        cancel_url: cancelUrl,
        merchant_name: merchantName,
        timestamp
    };
    const candidates = hashCandidates({ clientId, amount: amountStr, currency, orderRef, returnUrl, cancelUrl, timestamp });
    const reqBody = JSON.stringify({ payload: aesGcmBase64(JSON.stringify(payload), clientId) });

    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await getToken(attempt > 0);
        let unauthorized = false;
        let lastErr = '';
        for (const cand of candidates) {
            const res = await wfetch(SERVICE + '/generate/khqr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Payload-Hash': cand.hash
                },
                body: reqBody,
                signal: AbortSignal.timeout(8000)
            });
            if (res.status === 401 && attempt === 0) { unauthorized = true; break; } // token expired, retry once
            const json = await res.json().catch(() => null);
            const url = json && json.data && json.data.web_payment_url;
            if (res.ok && url) {
                if (winningHash !== cand.name) { winningHash = cand.name; console.log('Wing hash variant accepted:', cand.name); }
                return { url };
            }
            lastErr = `Wing generate failed: HTTP ${res.status} ${json ? (json.message || json.code || '') : ''} trace=${json && json.trace_id}`;
            if (!/hash/i.test(lastErr)) throw new Error(lastErr); // some other problem: stop trying variants
        }
        if (unauthorized) continue;
        console.error('Wing hash input (no secrets):', [amountStr, currency, orderRef, returnUrl, cancelUrl, timestamp].join('#'));
        throw new Error(lastErr + ` (tried ${candidates.map(c => c.name).join(', ')})`);
    }
    throw new Error('Wing generate failed: unauthorized');
}

/**
 * Ask Wing whether this order reference was paid.
 * @returns {Promise<{ state: 'PAID'|'UNPAID'|'ERROR', detail?: string }>}
 */
async function checkPaid(orderRef, expectedAmount) {
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await getToken(attempt > 0);
            const res = await wfetch(SERVICE + '/inquiry/khqr/success', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ order_reference_no: orderRef }),
                signal: AbortSignal.timeout(8000)
            });
            if (res.status === 401 && attempt === 0) continue;
            if (res.status === 404) return { state: 'UNPAID' }; // "No transaction found" = not paid yet

            const json = await res.json().catch(() => null);
            if (!res.ok || !json) return { state: 'ERROR', detail: `HTTP ${res.status}` };

            const d = json.data || json;
            if (!d.transaction_id && !d.amount && !d.total_amount) {
                return { state: 'ERROR', detail: `unexpected response: ${json.code || ''} ${json.message || ''}` };
            }
            // Wing: only accept amounts equal or greater than the price, in the right currency.
            const paid = Number(d.amount !== undefined ? d.amount : d.total_amount);
            if (d.currency && String(d.currency).toUpperCase() !== 'USD') {
                return { state: 'ERROR', detail: `wrong currency ${d.currency}` };
            }
            if (!Number.isFinite(paid) || paid + 0.005 < Number(expectedAmount)) {
                return { state: 'ERROR', detail: `underpaid: got ${d.amount}, expected ${expectedAmount}` };
            }
            return { state: 'PAID' };
        }
        return { state: 'ERROR', detail: 'unauthorized' };
    } catch (err) {
        return { state: 'ERROR', detail: 'network: ' + err.message };
    }
}

// Startup self-test: shows the verdict in the Deploy Logs a few seconds after every deploy.
if (isEnabled()) setTimeout(() => scheduleDiag('startup'), 5000);

module.exports = { isEnabled, isAvailable, diagnose, createPayment, checkPaid, _internal: { aesGcmBase64, payloadHash } };
