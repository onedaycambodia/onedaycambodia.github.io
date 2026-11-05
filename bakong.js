// Bakong KHQR helper: generate a dynamic KHQR and check whether it was paid.
// All secrets come from environment variables (set them on Railway), never in code.
//
//   BAKONG_TOKEN          API token from https://api-bakong.nbc.gov.kh (renew before it expires)
//   BAKONG_ACCOUNT_ID     your Bakong account id, e.g. yourname@aclb
//   BAKONG_MERCHANT_NAME  shown to the customer in their banking app
//   BAKONG_MERCHANT_CITY  optional, default "Phnom Penh"
//   BAKONG_API_URL        optional, default https://api-bakong.nbc.gov.kh

const BASE_URL = (process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/+$/, '');

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
 * Ask Bakong whether the QR with this md5 has been paid.
 * @returns {Promise<{ state: 'PAID'|'UNPAID'|'ERROR', detail?: string }>}
 */
async function checkPaid(md5, expectedAmount) {
    let last = { state: 'ERROR', detail: 'no attempt' };
    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 700));
        last = await checkOnce(md5, expectedAmount);
        if (last.state !== 'ERROR' || !last.retry) return last; // only network errors / 5xx / 429 are worth one retry
    }
    return last;
}

async function checkOnce(md5, expectedAmount) {
    let res;
    try {
        res = await fetch(`${BASE_URL}/v1/check_transaction_by_md5`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.BAKONG_TOKEN}`
            },
            body: JSON.stringify({ md5 }),
            signal: AbortSignal.timeout(8000)
        });
    } catch (err) {
        return { state: 'ERROR', retry: true, detail: 'network: ' + err.message };
    }

    let body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON body */ }

    // 401/403 = token expired/invalid or request blocked (Bakong may only accept Cambodian IPs)
    if (res.status === 401 || res.status === 403) {
        return { state: 'ERROR', detail: `HTTP ${res.status} (token expired, or the server IP is blocked by Bakong)` };
    }
    if (res.status === 429 || res.status >= 500) return { state: 'ERROR', retry: true, detail: `HTTP ${res.status} (Bakong busy)` };
    if (!body) return { state: 'ERROR', detail: `HTTP ${res.status} with no JSON` };

    if (body.responseCode === 0 && body.data) {
        // The amount is locked inside the QR, so a found transaction is the right amount. Only reject when Bakong
        // clearly reports a smaller positive amount; a missing/zero amount field must not block a real payment.
        const paid = Number(body.data.amount);
        if (expectedAmount !== undefined && Number.isFinite(paid) && paid > 0 && paid + 0.005 < Number(expectedAmount)) {
            return { state: 'ERROR', detail: `underpaid: got ${paid}, expected ${expectedAmount}` };
        }
        return { state: 'PAID' };
    }

    // "Transaction could not be found" = simply not paid yet (Bakong sends errorCode 1 or 3 depending on the case)
    if (body.responseCode === 1 && /could not be found/i.test(String(body.responseMessage || ''))) return { state: 'UNPAID' };

    return { state: 'ERROR', detail: `${body.responseCode}/${body.errorCode}: ${body.responseMessage || ''}` };
}

module.exports = { isEnabled, createKhqr, checkPaid };
