// Wing Bank "OnlineSDK-KHQR" v4: create a web KHQR payment page and check whether it was paid.
// Based on the OpenAPI file Wing published in the OpenAPI Marketplace.
//
//   WING_CLIENT_ID        from Wing (OpenAPI Marketplace credential email)
//   WING_CLIENT_SECRET    from Wing
//   WING_MERCHANT_NAME    optional, shown to the customer (falls back to BAKONG_MERCHANT_NAME)
//   WING_RETURN_URL       optional, where Wing sends the customer after paying (default: your Railway site)
//   WING_API_URL          optional, default https://prodint-gateway.wingbank.com.kh

const crypto = require('crypto');

const HOST = (process.env.WING_API_URL || 'https://prodint-gateway.wingbank.com.kh').replace(/\/+$/, '');
const SERVICE = HOST + '/onlinesdk-khqr/v4';
const DEVICE_ID = crypto.randomUUID(); // keeps Wing from revoking the token early (per their docs)

let tokenCache = { token: null, expiresAt: 0 };

// Node's fetch only says "fetch failed"; the real reason (DNS, timeout, refused, TLS) is in err.cause.
async function wfetch(url, opts) {
    try {
        return await fetch(url, opts);
    } catch (err) {
        const c = err && err.cause ? (err.cause.code || err.cause.message) : '';
        throw new Error(`cannot reach Wing (${new URL(url).host}): ${err.message}${c ? ' - ' + c : ''}`);
    }
}

function isEnabled() {
    return Boolean(process.env.WING_CLIENT_ID && process.env.WING_CLIENT_SECRET);
}

// AES-256-GCM exactly as the docs describe: IV = first 12 chars of client_id,
// key = client_id padded/truncated to 32 chars. Output = base64(ciphertext + auth tag).
function aesGcmBase64(plain, clientId) {
    if (clientId.length < 12) throw new Error('WING_CLIENT_ID is too short (needs at least 12 characters)');
    const iv = Buffer.from(clientId.slice(0, 12), 'utf8');
    const key = Buffer.from(clientId.padEnd(32, '0').slice(0, 32), 'utf8');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return enc.toString('base64');
}

// X-Payload-Hash = SHA256( B64( AES256( B64( client_id#amount#currency#order_ref#return_url#cancel_url#timestamp ) ) ) )
function payloadHash({ clientId, amount, currency, orderRef, returnUrl, cancelUrl, timestamp }) {
    const joined = [clientId, amount, currency, orderRef, returnUrl, cancelUrl, timestamp].join('#');
    const step2 = Buffer.from(joined, 'utf8').toString('base64');
    const step4 = aesGcmBase64(step2, clientId);
    return crypto.createHash('sha256').update(step4).digest('hex');
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
        signal: AbortSignal.timeout(10000)
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
    const hash = payloadHash({ clientId, amount: amountStr, currency, orderRef, returnUrl, cancelUrl, timestamp });
    const reqBody = JSON.stringify({ payload: aesGcmBase64(JSON.stringify(payload), clientId) });

    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await getToken(attempt > 0);
        const res = await wfetch(SERVICE + '/generate/khqr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Payload-Hash': hash
            },
            body: reqBody,
            signal: AbortSignal.timeout(10000)
        });
        if (res.status === 401 && attempt === 0) continue; // token expired, retry once with a fresh one
        const json = await res.json().catch(() => null);
        const url = json && json.data && json.data.web_payment_url;
        if (!res.ok || !url) {
            throw new Error(`Wing generate failed: HTTP ${res.status} ${json ? (json.message || json.code || '') : ''} trace=${json && json.trace_id}`);
        }
        return { url };
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

module.exports = { isEnabled, createPayment, checkPaid, _internal: { aesGcmBase64, payloadHash } };
