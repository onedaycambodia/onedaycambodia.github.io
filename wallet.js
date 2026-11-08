// 💰 Customer Wallet: balance per account, top-up by KHQR (Bakong), pay orders from the balance.
// Tables are created automatically. Nothing changes for shoppers who never touch the wallet.
const TOPUP_MIN = Number(process.env.WALLET_MIN_TOPUP) || 1;
const TOPUP_MAX = Number(process.env.WALLET_MAX_TOPUP) || 500;
const TOPUP_EXPIRE_MIN = Number(process.env.WALLET_TOPUP_EXPIRE_MIN) || 3;

module.exports = function (app, { pool, bakong, customers }) {
    async function init(attempt = 1) {
        try {
            await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0`);
            await pool.query(`CREATE TABLE IF NOT EXISTS wallet_topups (
                id SERIAL PRIMARY KEY, customer_id INT NOT NULL, amount NUMERIC(12,2) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'AWAITING', khqr_md5 CHAR(32) UNIQUE,
                expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), paid_at TIMESTAMPTZ)`);
            await pool.query(`CREATE TABLE IF NOT EXISTS wallet_tx (
                id SERIAL PRIMARY KEY, customer_id INT NOT NULL, type VARCHAR(20) NOT NULL,
                amount NUMERIC(12,2) NOT NULL, balance_after NUMERIC(12,2), ref VARCHAR(40),
                created_at TIMESTAMPTZ DEFAULT NOW())`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_tx_cust ON wallet_tx (customer_id, id DESC)`);
            console.log('Wallet ready.');
        } catch (e) {
            console.error('wallet init failed (attempt ' + attempt + '):', e.message);
            if (attempt < 10) setTimeout(() => init(attempt + 1), 3000 * attempt).unref();
        }
    }
    init();

    // Used by /api/order inside its transaction. Returns the new balance, or null when the balance is too low.
    async function spend(client, customerId, amount, ref) {
        const r = await client.query(
            `UPDATE customers SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance`,
            [amount, customerId]);
        if (!r.rows.length) return null;
        const bal = Number(r.rows[0].wallet_balance);
        await client.query(`INSERT INTO wallet_tx (customer_id, type, amount, balance_after, ref) VALUES ($1,'order',$2,$3,$4)`,
            [customerId, -amount, bal, ref]);
        return bal;
    }

    // Credit once, even if several requests see "paid" at the same moment.
    async function creditTopup(topupId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const t = await client.query(
                `UPDATE wallet_topups SET status = 'PAID', paid_at = NOW() WHERE id = $1 AND status = 'AWAITING' RETURNING customer_id, amount`, [topupId]);
            if (!t.rows.length) { await client.query('ROLLBACK'); return false; }
            const { customer_id, amount } = t.rows[0];
            const b = await client.query(`UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance`, [amount, customer_id]);
            await client.query(`INSERT INTO wallet_tx (customer_id, type, amount, balance_after, ref) VALUES ($1,'topup',$2,$3,$4)`,
                [customer_id, amount, b.rows[0].wallet_balance, 'topup:' + topupId]);
            await client.query('COMMIT');
            return true;
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (_) {}
            console.error('creditTopup:', e.message);
            return false;
        } finally { client.release(); }
    }

    const lastCheck = new Map(); // md5 -> time of last Bakong call (keeps the daily Bakong budget safe)

    app.get('/api/my/wallet', async (req, res) => {
        const c = await customers.authCustomer(req);
        if (!c) return res.status(401).json({ ok: false });
        try {
            const b = await pool.query('SELECT wallet_balance FROM customers WHERE id = $1', [c.id]);
            const tx = await pool.query(
                `SELECT type, amount, balance_after, created_at FROM wallet_tx WHERE customer_id = $1 ORDER BY id DESC LIMIT 50`, [c.id]);
            res.json({
                ok: true, balance: Number(b.rows[0] ? b.rows[0].wallet_balance : 0),
                min: TOPUP_MIN, max: TOPUP_MAX, khqr_enabled: bakong.isEnabled(),
                tx: tx.rows.map(r => ({ type: r.type, amount: Number(r.amount), balance_after: Number(r.balance_after), created_at: r.created_at }))
            });
        } catch (e) { console.error('my/wallet:', e.message); res.status(500).json({ ok: false }); }
    });

    app.post('/api/my/wallet/topup', async (req, res) => {
        const c = await customers.authCustomer(req);
        if (!c) return res.status(401).json({ ok: false, need_login: true });
        try {
            if (!bakong.isEnabled()) return res.json({ ok: false, error: 'unavailable' });
            const amount = Number(Number((req.body || {}).amount).toFixed(2));
            if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) return res.json({ ok: false, error: 'range', min: TOPUP_MIN, max: TOPUP_MAX });
            const open = await pool.query(`SELECT COUNT(*)::int n FROM wallet_topups WHERE customer_id = $1 AND status = 'AWAITING' AND expires_at > NOW()`, [c.id]);
            if (open.rows[0].n >= 3) return res.json({ ok: false, error: 'too_many' });
            const expiresAt = new Date(Date.now() + TOPUP_EXPIRE_MIN * 60 * 1000);
            const ins = await pool.query(
                `INSERT INTO wallet_topups (customer_id, amount, expires_at) VALUES ($1,$2,$3) RETURNING id`, [c.id, amount, expiresAt]);
            const id = ins.rows[0].id;
            const k = bakong.createKhqr({ amount, billNumber: `WT${id}`, expiresAt: expiresAt.getTime() });
            await pool.query(`UPDATE wallet_topups SET khqr_md5 = $1 WHERE id = $2`, [k.md5, id]);
            res.json({ ok: true, qr: k.qr, md5: k.md5, amount, expires_at: expiresAt.getTime() });
        } catch (e) { console.error('wallet topup:', e.message); res.status(500).json({ ok: false, error: 'server' }); }
    });

    app.get('/api/my/wallet/topup/:md5', async (req, res) => {
        const c = await customers.authCustomer(req);
        if (!c) return res.status(401).json({ status: 'LOGIN' });
        try {
            const md5 = String(req.params.md5).toLowerCase();
            if (!/^[a-f0-9]{32}$/.test(md5)) return res.status(400).json({ status: 'INVALID' });
            const r = await pool.query(`SELECT id, amount, status, expires_at FROM wallet_topups WHERE khqr_md5 = $1 AND customer_id = $2`, [md5, c.id]);
            if (!r.rows.length) return res.status(404).json({ status: 'NOT_FOUND' });
            const t = r.rows[0];
            if (t.status === 'PAID') return res.json({ status: 'PAID' });
            if (t.status !== 'AWAITING') return res.json({ status: 'EXPIRED' });

            const expired = new Date(t.expires_at) <= new Date();
            const now = Date.now();
            const gap = (req.query.force === '1') ? 8000 : 15000;
            if (!expired && now - (lastCheck.get(md5) || 0) < gap) return res.json({ status: 'WAITING' });
            lastCheck.set(md5, now);
            const chk = await bakong.checkPaid(md5, Number(t.amount), expired ? 'final' : (req.query.force === '1' ? 'manual' : 'auto'));
            if (chk.state === 'PAID') { await creditTopup(t.id); return res.json({ status: 'PAID' }); }
            if (expired) {
                if (chk.state === 'UNPAID') {
                    await pool.query(`UPDATE wallet_topups SET status = 'EXPIRED' WHERE id = $1 AND status = 'AWAITING'`, [t.id]);
                    return res.json({ status: 'EXPIRED' });
                }
                return res.json({ status: 'WAITING', manual: true }); // Bakong could not answer: never guess "unpaid"
            }
            res.json({ status: 'WAITING' });
        } catch (e) { console.error('wallet topup status:', e.message); res.status(500).json({ status: 'ERROR' }); }
    });

    return { spend };
};
