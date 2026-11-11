        /* ===================== 💰 WALLET ===================== */
        Object.assign(AUTH_T.km, { wallet:'Wallet', wl_topup:'បញ្ចូល Wallet', wl_title:'បញ្ចូលលុយចូល Wallet', wl_amount:'ចំនួនទឹកប្រាក់ (USD)', wl_method:'វិធីបង់ប្រាក់', wl_khqr:'Scan By KHQR-Bakong', wl_khqr_sub:'ស្កេនតាម ABA, ACLEDA ឬធនាគារណាមួយ', wl_gen:'បង្កើត QR បង់ប្រាក់', wl_range:'សូមបញ្ចូលចន្លោះ', wl_scan:'ស្កេន QR ដើម្បីបង់ប្រាក់', wl_wait:'កំពុងរង់ចាំការបង់ប្រាក់...', wl_expires:'ផុតកំណត់ក្នុង', wl_ok:'បញ្ចូល Wallet បានជោគជ័យ!', wl_expired:'QR នេះផុតកំណត់ហើយ។ បើអ្នកបានបង់រួច សូមទាក់ទងហាង។', wl_check:'ខ្ញុំបានបង់ហើយ - ពិនិត្យម្តងទៀត', wl_hist:'ប្រវត្តិ Wallet', wl_none:'មិនទាន់មានប្រវត្តិ', wl_t_topup:'បញ្ចូលលុយ', wl_t_order:'បង់ទិញទំនិញ', wl_unavail:'ការបង់ប្រាក់តាម KHQR មិនទាន់ដំណើរការ', wl_toomany:'មាន QR រង់ចាំច្រើនពេក សូមរង់ចាំបន្តិច', wl_pay:'បង់ពី Wallet', wl_bal:'សមតុល្យ', wl_low:'សមតុល្យមិនគ្រប់ សូមបញ្ចូល Wallet', wl_done:'រួចរាល់', wl_hbtn:'ប្រវត្តិ', wl_t_refund:'សងប្រាក់វិញ', wl_hint:'បើកកម្មវិធីធនាគារ (ABA, ACLEDA...) ហើយស្កេន QR នេះ។ សូមបើកទំព័រនេះរហូតដល់ឃើញការបង់ប្រាក់ជោគជ័យ។' });
        Object.assign(AUTH_T.en, { wallet:'Wallet', wl_topup:'Top up', wl_title:'Top up Wallet', wl_amount:'Amount (USD)', wl_method:'Payment method', wl_khqr:'Scan By KHQR-Bakong', wl_khqr_sub:'Scan with ABA, ACLEDA or any bank app', wl_gen:'Create payment QR', wl_range:'Enter an amount between', wl_scan:'Scan the QR to pay', wl_wait:'Waiting for payment...', wl_expires:'Expires in', wl_ok:'Wallet topped up!', wl_expired:'This QR has expired. If you already paid, please contact the shop.', wl_check:'I have paid - check again', wl_hist:'Wallet history', wl_none:'No history yet', wl_t_topup:'Top up', wl_t_order:'Order payment', wl_unavail:'KHQR payment is not available right now', wl_toomany:'Too many QR codes waiting, please wait a moment', wl_pay:'Pay with Wallet', wl_bal:'Balance', wl_low:'Not enough balance, please top up', wl_done:'Done', wl_hbtn:'History', wl_t_refund:'Refund', wl_hint:'Open any banking app (ABA, ACLEDA...) and scan this QR. Keep this page open until the payment succeeds.' });
        Object.assign(AUTH_T.zh, { wallet:'钱包', wl_topup:'充值', wl_title:'钱包充值', wl_amount:'金额 (USD)', wl_method:'付款方式', wl_khqr:'Scan By KHQR-Bakong', wl_khqr_sub:'用 ABA、ACLEDA 或任何银行 App 扫码', wl_gen:'生成付款二维码', wl_range:'请输入金额范围', wl_scan:'扫码付款', wl_wait:'等待付款...', wl_expires:'剩余时间', wl_ok:'充值成功！', wl_expired:'二维码已过期。如已付款，请联系商店。', wl_check:'我已付款 - 重新检查', wl_hist:'钱包记录', wl_none:'暂无记录', wl_t_topup:'充值', wl_t_order:'订单付款', wl_unavail:'KHQR 付款暂不可用', wl_toomany:'待付二维码过多，请稍候', wl_pay:'用钱包付款', wl_bal:'余额', wl_low:'余额不足，请先充值', wl_done:'完成', wl_hbtn:'记录', wl_t_refund:'退款', wl_hint:'打开任意银行 App (ABA、ACLEDA...) 扫描二维码，付款成功前请保持此页面打开。' });

        let wlState = { balance: 0, min: 1, max: 500, khqr_enabled: false, tx: [] };
        let wlTimer = null, wlCount = null, wlMd5 = null, wlAmt = 0, wlPickedAmount = '';
        const wlMoney = n => '$' + Number(n || 0).toFixed(2);

        async function wlLoad() {
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/my/wallet`, { headers: authHeaders(), cache: 'no-store' });
                if (!r.ok) return null;
                const j = await r.json();
                if (j && j.ok) { wlState = j; ['wlBal', 'wlFormBal'].forEach(id => { const b = document.getElementById(id); if (b) b.textContent = wlMoney(j.balance); }); return j; }
            } catch (e) {}
            return null;
        }
        function wlStop() { clearInterval(wlTimer); clearInterval(wlCount); wlTimer = wlCount = null; wlMd5 = null; }
        function wlClose() { wlStop(); closeModal('walletModal'); wlLoad(); }

        // The wallet screen replaces the screen it was opened from (account / checkout) instead of stacking on top of it;
        // closing the wallet brings that screen back.
        let wlOpener = null;
        function wlHideOpener() {
            const w = document.getElementById('walletModal');
            if (w.classList.contains('active')) return;   // already inside the wallet
            wlOpener = null;
            for (const id of ['checkoutModal', 'acctModal']) {
                const el = document.getElementById(id);
                if (el && el.classList.contains('active')) { wlOpener = id; el.classList.remove('active'); break; }
            }
        }
        (function () {
            const _cm = closeModal;
            closeModal = function (id) {
                if (id === 'walletModal') {
                    wlStop();
                    const o = wlOpener; wlOpener = null;
                    if (o) { const el = document.getElementById(o); if (el) el.classList.add('active'); if (o === 'checkoutModal') wlRefreshCheckout(); }
                }
                return _cm.apply(this, arguments);
            };
        })();

        async function wlOpen() {
            if (!authToken) { openAuth(); return; }
            wlStop(); applyAuthLang();
            document.querySelector('#walletModal .modal-content').classList.remove('kq-success');
            document.getElementById('wlForm').style.display = 'block';
            document.getElementById('wlQr').style.display = 'none';
            document.getElementById('wlHistView').style.display = 'none';
            document.getElementById('wlTitle').textContent = at('wl_title');
            document.getElementById('wlErr').textContent = '';
            document.getElementById('wlAmount').value = '';
            document.getElementById('wlChips').innerHTML = [5, 10, 20, 50].map(v => `<button type="button" class="wl-chip" onclick="wlPick(${v})">$${v}</button>`).join('');
            document.getElementById('wlMethods').innerHTML = `<div class="wl-method"><img src="images/bakong.png" width="30" height="30" alt="" style="border-radius:7px"><div>${esc(at('wl_khqr'))}<small>${esc(at('wl_khqr_sub'))}</small></div></div>`;
            wlHideOpener();
            openModal('walletModal');
            await wlLoad();
        }
        async function wlOpenHist() {
            if (!authToken) { openAuth(); return; }
            wlStop(); applyAuthLang();
            document.querySelector('#walletModal .modal-content').classList.remove('kq-success');
            document.getElementById('wlForm').style.display = 'none';
            document.getElementById('wlQr').style.display = 'none';
            document.getElementById('wlHistView').style.display = 'block';
            document.getElementById('wlTitle').textContent = at('wl_hist');
            document.getElementById('wlHistFull').innerHTML = `<div class="wl-sub">${esc(at('loading'))}</div>`;
            wlHideOpener();
            openModal('walletModal');
            await wlLoad();
            wlHist('wlHistFull');
            document.getElementById('wlHistView').insertAdjacentHTML('beforeend', '');
        }
        function wlPick(v) {
            document.getElementById('wlAmount').value = v;
            document.querySelectorAll('#wlChips .wl-chip').forEach(c => c.classList.toggle('on', c.textContent === '$' + v));
        }
        function wlHist(target) {
            const el = document.getElementById(target || 'wlHist');
            if (!el) return;
            const loc = currentLang === 'km' ? 'km-KH' : currentLang === 'zh' ? 'zh-CN' : 'en-GB';
            el.innerHTML = (wlState.tx || []).length ? wlState.tx.map(t => `<div class="wl-tx"><div>${esc(at(t.type === 'topup' ? 'wl_t_topup' : t.type === 'refund' ? 'wl_t_refund' : 'wl_t_order'))}<small>${esc(new Date(t.created_at).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' }))} · ${esc(at('wl_bal'))} ${wlMoney(t.balance_after)}</small></div><b class="${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount >= 0 ? '+' : '-'}$${Math.abs(t.amount).toFixed(2)}</b></div>`).join('') : `<div class="wl-sub">${esc(at('wl_none'))}</div>`;
        }

        async function wlCreate() {
            const err = document.getElementById('wlErr'), btn = document.getElementById('wlGo');
            const amt = Number(document.getElementById('wlAmount').value);
            err.textContent = '';
            if (!wlState.khqr_enabled) { err.textContent = at('wl_unavail'); return; }
            if (!(amt >= wlState.min && amt <= wlState.max)) { err.textContent = at('wl_range') + ` $${wlState.min} - $${wlState.max}`; return; }
            btn.disabled = true;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/my/wallet/topup`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ amount: amt }) });
                const j = await r.json();
                if (r.status === 401) { clearAuth(); closeModal('walletModal'); openAuth(); return; }
                if (!j.ok) { err.textContent = j.error === 'too_many' ? at('wl_toomany') : j.error === 'range' ? at('wl_range') + ` $${j.min} - $${j.max}` : at('wl_unavail'); return; }
                wlShowQr(j);
            } catch (e) { err.textContent = at('err_net'); }
            finally { btn.disabled = false; }
        }
        function wlShowQr(j) {
            wlStop(); wlMd5 = j.md5; wlAmt = j.amount;
            document.getElementById('wlForm').style.display = 'none';
            const box = document.getElementById('wlQr'); box.style.display = 'block';
            box.innerHTML = `<div class="kq-merchant"><img src="images/oneday_clothing_logo_180x180.png" alt="Oneday"><div><div class="kq-m-name">Oneday Cambodia</div><div class="kq-m-sub">${esc(at('wl_title')).toUpperCase()} · KHQR</div></div></div>
                <div class="kq-amount">${wlMoney(j.amount)}</div>
                <div class="kq-qr"><div id="wlQrImg" class="kq-qr-box"></div><span class="kq-corner tl"></span><span class="kq-corner tr"></span><span class="kq-corner bl"></span><span class="kq-corner br"></span><div class="kq-scan"></div></div>
                <div><span class="kq-status" id="wlSt">${ico('spinner')} ${esc(at('wl_wait'))}</span></div>
                <div class="kq-timer"><div class="kq-bar"><i id="wlBar"></i></div><div class="kq-time">${esc(at('wl_expires'))} <b id="wlCd"></b></div></div>
                <div class="kq-hint">${esc(at('wl_hint'))}</div>
                <button class="kq-btn-ghost" type="button" onclick="wlPoll(true)"><span>${esc(at('wl_check'))}</span></button>`;
            new QRCode(document.getElementById('wlQrImg'), { text: j.qr, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.M });
            const total = Math.max(1, j.expires_at - Date.now());
            const tick = () => {
                const left = Math.max(0, j.expires_at - Date.now());
                const cd = document.getElementById('wlCd'), bar = document.getElementById('wlBar');
                if (cd) cd.textContent = Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0');
                if (bar) bar.style.width = (left / total * 100) + '%';
            };
            tick(); wlCount = setInterval(tick, 1000);
            wlTimer = setInterval(() => wlPoll(false), 4000);
            wlPoll(false);
        }
        let wlPolling = false;
        async function wlPoll(force) {
            if (!wlMd5 || (wlPolling && !force)) return;
            wlPolling = true;
            const md5 = wlMd5;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/my/wallet/topup/${md5}${force ? '?force=1' : ''}`, { headers: authHeaders(), cache: 'no-store' });
                const s = await r.json();
                if (md5 !== wlMd5) return;
                const box = document.getElementById('wlQr');
                if (s.status === 'PAID') {
                    wlStop(); await wlLoad();
                    document.querySelector('#walletModal .modal-content').classList.add('kq-success');
                    box.innerHTML = '<div class="ty-wrap"><div class="kq-confetti" id="wlConfetti"></div>' +
                        '<div class="ty-badge"><svg viewBox="0 0 52 52" aria-hidden="true"><path class="tick" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div>' +
                        '<div class="ty-brand"><img src="images/oneday_clothing_logo_180x180.png" alt=""><span class="ty-name"><b>One</b>day<em>.</em></span></div>' +
                        '<div class="ty-title">' + esc(at('wl_ok')) + '</div>' +
                        '<div class="ty-sub">' + esc(at('wallet')) + ': ' + wlMoney(wlState.balance) + '</div>' +
                        '<div class="ty-amount">' + ico('check') + ' +' + wlMoney(wlAmt) + '</div></div>' +
                        '<button class="btn-modal-telegram" type="button" style="margin-top:18px" onclick="wlClose()"><span>' + esc(at('wl_done')) + '</span></button>';
                    launchConfetti(document.getElementById('wlConfetti'));
                    payUserPicked = false; wlRefreshCheckout();
                } else if (s.status === 'EXPIRED' || s.status === 'NOT_FOUND') {
                    wlStop();
                    box.innerHTML = `<div class="wl-note">${ico('hourglass')}<span>${esc(at('wl_expired'))}</span></div><button class="btn-modal-telegram" type="button" style="margin-top:16px" onclick="wlOpen()"><span>${esc(at('wl_topup'))}</span></button>`;
                }
            } catch (e) {}
            wlPolling = false;
        }

        // ---- checkout: "Pay with Wallet" option ----
        async function wlRefreshCheckout() {
            const row = document.getElementById('payRowWallet'), box = document.getElementById('paymentMethodBox');
            if (!row || !box) return;
            if (!authToken) { row.style.display = 'none'; return; }
            const j = await wlLoad();
            if (!j) { row.style.display = 'none'; return; }
            const need = parseFloat(String((document.getElementById('checkout-total-price') || {}).textContent || '0').replace(/[^0-9.]/g, '')) || 0;
            const enough = j.balance + 1e-9 >= need && need > 0;
            const radio = document.getElementById('payRadioWallet');
            box.style.display = 'block'; row.style.display = 'flex';
            radio.disabled = !enough;
            row.classList.toggle('low', !enough);                 // dark-red pulsing look when the balance is too low
            document.getElementById('payWalletText').textContent = at('wl_pay') + ' · ' + at('wl_bal') + ' ' + wlMoney(j.balance) + (enough ? '' : ' (' + at('wl_low') + ')');
            if (!enough && radio.checked) { const d = document.querySelector('input[name="payMethod"][value="' + (khqrEnabled ? 'khqr' : 'cod') + '"]'); if (d) d.checked = true; }
            // smart default: enough money in the wallet -> pre-select Wallet (unless the customer already picked something themselves)
            if (enough && !payUserPicked) radio.checked = true;
        }
        let payUserPicked = false;
        document.addEventListener('change', (e) => { if (e.target && e.target.name === 'payMethod') payUserPicked = true; });
        document.addEventListener('click', (e) => {            // tapping the greyed-out Wallet row (not the "+") gives a little shake
            const row = e.target.closest && e.target.closest('#payRowWallet');
            if (row && row.classList.contains('low') && !e.target.closest('.wl-mini')) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); setTimeout(() => row.classList.remove('shake'), 450); }
        });
        (function () { const _om = openModal; openModal = function (id) { const r = _om.apply(this, arguments); if (id === 'checkoutModal') { payUserPicked = false; wlRefreshCheckout(); } return r; }; })();

        async function startWalletPayment(orderData) {
            if (khqrBusy) return;
            khqrBusy = true;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/order`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ ...orderData, payment_method: 'wallet' }) });
                const j = await r.json();
                if (j && j.need_login) { clearAuth(); openAuth(); return; }
                if (!j.success) { uiAlert(j.insufficient ? at('wl_low') : (j.message || 'Error'), 'error'); if (j.insufficient) wlRefreshCheckout(); return; }
                cart = {}; renderCart(); updateAllCardStocks();
                closeModal('checkoutModal');
                const kq = document.querySelector('#khqrModal .modal-content'); if (kq) kq.classList.remove('kq-success');
                khqrAmountText = '$' + Number(j.amount).toFixed(2);
                openModal('khqrModal');
                showKhqrResult(translations[currentLang].khqr_paid, true);
                wlLoad();
            } catch (e) { uiAlert('Network error', 'network'); }
            finally { khqrBusy = false; }
        }

        // ---- gates: +Add to cart / Order Now need a login ----
        (function () {
            const _add = addToCart;
            addToCart = function (btn, price, cardId, ref, ev) {
                if (needLogin()) { const sb = document.querySelector('#' + cardId + ' .size-btn.active'); authMeta = { add: { ref, size: sb ? sb.innerText : 'M' } }; openAuth(() => _add(btn, price, cardId, ref, ev)); return; }
                return _add.apply(this, arguments);
            };
            const _prep = prepareOrder;
            prepareOrder = function () {
                if (needLogin()) { authMeta = { order: true }; openAuth(() => _prep()); return; }
                return _prep.apply(this, arguments);
            };
            const _load = loadUserInfo;   // pre-fill the checkout form from the account
            loadUserInfo = function () {
                _load();
                if (authCust) {
                    const n = document.getElementById('custName'), p = document.getElementById('custPhone');
                    if (n && !n.value) n.value = authCust.name || '';
                    if (p && !p.value) p.value = authCust.phone || '';
                }
            };
        })();
