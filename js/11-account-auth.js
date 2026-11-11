        /* ===================== 👤 CUSTOMER ACCOUNT (login + my orders) ===================== */
        const AUTH_T = {
            km: { login_title:'ចូលគណនី', login_sub:'បញ្ចូលឈ្មោះ និងលេខទូរស័ព្ទ យើងនឹងផ្ញើកូដ ៤ ខ្ទង់ទៅ Telegram របស់អ្នក', name:'ឈ្មោះរបស់អ្នក', phone:'លេខទូរស័ព្ទ (Telegram)', next:'បន្ទាប់', code_sub:'កូដ ៤ ខ្ទង់ត្រូវបានផ្ញើទៅ Telegram នៃលេខ', verify:'បញ្ជាក់', resend:'ផ្ញើកូដម្តងទៀត', resend_in:'ផ្ញើម្តងទៀតក្នុង ', back:'ត្រឡប់ក្រោយ',
                err_name:'សូមបញ្ចូលឈ្មោះ', err_phone:'លេខទូរស័ព្ទមិនត្រឹមត្រូវ', err_no_tg:'លេខនេះមិនមាន Telegram ទេ សូមប្រើលេខដែលមាន Telegram', err_wait:'សូមរង់ចាំបន្តិច មុនផ្ញើកូដម្តងទៀត', err_many:'ព្យាយាមច្រើនពេក សូមរង់ចាំ', err_send:'មិនអាចផ្ញើកូដបានទេ សូមសាកល្បងម្តងទៀត', err_wrong:'កូដមិនត្រឹមត្រូវ', err_expired:'កូដផុតកំណត់ សូមផ្ញើម្តងទៀត', err_locked:'ខុសច្រើនដង សូមផ្ញើកូដថ្មី', err_net:'មិនអាចភ្ជាប់ Server បានទេ',
                consent_pre:'ដោយបន្ត អ្នកយល់ព្រមតាម', consent_terms:'លក្ខខណ្ឌប្រើប្រាស់', consent_and:'និង', consent_priv:'គោលការណ៍ភាពឯកជន', gg_btn:'បន្តដោយប្រើ Google', login_lead:'ចូលគណនីដើម្បីរក្សាទុកព័ត៌មានរបស់អ្នក និងតាមដានការកុម្មង់ ដោយមិនបាច់បំពេញម្តងទៀត។', connecting:'កំពុងតភ្ជាប់...', tt_btn:'បន្តដោយប្រើ TikTok', account:'គណនី', my_orders:'ការកុម្មង់របស់ខ្ញុំ', logout:'ចាកចេញ', saved:'បានរក្សាទុក', err_save:'រក្សាទុកមិនបាន សូមសាកល្បងម្តងទៀត', no_orders:'មិនទាន់មានការកុម្មង់ទេ', loading:'កំពុងផ្ទុក...', tg_sub:'ចុចប៊ូតុងខាងក្រោម រួចចុច Accept ក្នុង Telegram ជាការស្រេច — មិនបាច់វាយលេខ ឬកូដទេ។', tg_btn:'បន្តដោយប្រើ Telegram', tg_wait:'កំពុងរង់ចាំ Telegram...', err_tg_phone:'Telegram មិនបានផ្តល់លេខទូរស័ព្ទ សូមអនុញ្ញាត (Allow) ការចូលមើលលេខទូរស័ព្ទ', err_tg:'Login មិនបានសម្រេច សូមសាកល្បងម្តងទៀត',
                st_PENDING:'រង់ចាំបញ្ជាក់', st_CONFIRMED:'ហាងបានបញ្ជាក់', st_AWAITING_PAYMENT:'រង់ចាំបង់ប្រាក់', st_CANCELLED:'បានលុបចោល', st_EXPIRED:'ផុតកំណត់',
                pay_paid:'បង់ប្រាក់រួច', pay_unpaid:'មិនទាន់បង់', pay_cod:'បង់ពេលទទួល', pay_none:'មិនបានបង់', pay_refunded:'ទឹកប្រាក់បានបង្វិល', total:'សរុប', order:'កុម្មង់ #' },
            en: { login_title:'Sign in', login_sub:'Enter your name and phone number. We will send a 4-digit code to your Telegram.', name:'Your name', phone:'Phone number (Telegram)', next:'Next', code_sub:'A 4-digit code was sent to the Telegram of', verify:'Verify', resend:'Resend code', resend_in:'Resend in ', back:'Back',
                err_name:'Please enter your name', err_phone:'Invalid phone number', err_no_tg:'This number is not on Telegram. Please use a Telegram number.', err_wait:'Please wait a moment before resending', err_many:'Too many attempts, please wait', err_send:'Could not send the code, please try again', err_wrong:'Wrong code', err_expired:'Code expired, please resend', err_locked:'Too many wrong tries, request a new code', err_net:'Cannot reach the server',
                consent_pre:'By continuing, you agree to our', consent_terms:'Terms of Service', consent_and:'and', consent_priv:'Privacy Policy', gg_btn:'Continue with Google', login_lead:'Log in to save your details and track your orders, with no need to fill them in again.', connecting:'Connecting...', tt_btn:'Continue with TikTok', account:'Account', my_orders:'My orders', logout:'Log out', saved:'Saved', err_save:'Could not save, please try again', no_orders:'No orders yet', loading:'Loading...', tg_sub:'Tap the button below, then tap Accept in Telegram. No typing, no code.', tg_btn:'Continue with Telegram', tg_wait:'Waiting for Telegram...', err_tg_phone:'Telegram did not share your phone number. Please allow phone access.', err_tg:'Login failed, please try again',
                st_PENDING:'Awaiting confirmation', st_CONFIRMED:'Confirmed', st_AWAITING_PAYMENT:'Awaiting payment', st_CANCELLED:'Cancelled', st_EXPIRED:'Expired',
                pay_paid:'Paid', pay_unpaid:'Unpaid', pay_cod:'Pay on delivery', pay_none:'Not paid', pay_refunded:'Refunded', total:'Total', order:'Order #' },
            zh: { login_title:'登录', login_sub:'请输入姓名和手机号，我们会向您的 Telegram 发送 4 位验证码。', name:'您的姓名', phone:'手机号 (Telegram)', next:'下一步', code_sub:'4 位验证码已发送至以下号码的 Telegram：', verify:'确认', resend:'重新发送', resend_in:'重新发送：', back:'返回',
                err_name:'请输入姓名', err_phone:'手机号无效', err_no_tg:'该号码未注册 Telegram，请使用 Telegram 号码', err_wait:'请稍候再重新发送', err_many:'尝试次数过多，请稍候', err_send:'验证码发送失败，请重试', err_wrong:'验证码错误', err_expired:'验证码已过期，请重新发送', err_locked:'错误次数过多，请重新获取', err_net:'无法连接服务器',
                consent_pre:'继续即表示您同意我们的', consent_terms:'服务条款', consent_and:'和', consent_priv:'隐私政策', gg_btn:'使用 Google 继续', login_lead:'登录后可保存您的信息并跟踪订单，无需重复填写。', connecting:'正在连接...', tt_btn:'使用 TikTok 继续', account:'账户', my_orders:'我的订单', logout:'退出登录', saved:'已保存', err_save:'保存失败，请重试', no_orders:'暂无订单', loading:'加载中...', tg_sub:'点击下方按钮，然后在 Telegram 中点击“接受”即可，无需输入号码或验证码。', tg_btn:'使用 Telegram 继续', tg_wait:'等待 Telegram...', err_tg_phone:'Telegram 未提供手机号，请允许访问手机号。', err_tg:'登录失败，请重试',
                st_PENDING:'等待确认', st_CONFIRMED:'商家已确认', st_AWAITING_PAYMENT:'等待付款', st_CANCELLED:'已取消', st_EXPIRED:'已过期',
                pay_paid:'已付款', pay_unpaid:'未付款', pay_cod:'货到付款', pay_none:'未付款', pay_refunded:'已退款', total:'合计', order:'订单 #' }
        };
        function at(k) { const d = AUTH_T[currentLang] || AUTH_T.km; return d[k] != null ? d[k] : (AUTH_T.km[k] || k); }
        function applyAuthLang() {
            document.querySelectorAll('[data-at]').forEach(el => { el.textContent = at(el.getAttribute('data-at')); });
            document.querySelectorAll('[data-atph]').forEach(el => { el.placeholder = at(el.getAttribute('data-atph')); });
        }
        (function () { const _cl = changeLanguage; changeLanguage = function () { const r = _cl.apply(this, arguments); applyAuthLang(); return r; }; })();

        const AUTH_LS = 'oneday_auth_token', AUTH_COOKIE = 'oneday_t';
        let authProvider = null, tgClientId = '', googleClientId = '', ttClientKey = '', ggReady = false, authEnabled = false, authToken = null, authCust = null, authPending = null, auPhoneVal = '', auTimer = null;

        function authStoreGet() {
            let t = null;
            try { t = localStorage.getItem(AUTH_LS); } catch (e) {}
            if (!t) { const m = document.cookie.match(new RegExp('(?:^|; )' + AUTH_COOKIE + '=([^;]+)')); if (m) t = m[1]; }
            return t && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
        }
        function authStoreSet(t) {   // saved in localStorage AND a ~13-month cookie (a second copy in case one is dropped)
            try { if (t) localStorage.setItem(AUTH_LS, t); else localStorage.removeItem(AUTH_LS); } catch (e) {}
            try { document.cookie = AUTH_COOKIE + '=' + (t || '') + '; max-age=' + (t ? 34560000 : 0) + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) {}
        }
        function authHeaders() { return authToken ? { Authorization: 'Bearer ' + authToken } : {}; }
        function clearAuth() { authToken = null; authCust = null; authStoreSet(null); updateAcctUi(); }
        function updateAcctUi() {
            const b = document.getElementById('accountBtn'); if (b) b.classList.toggle('in', !!authToken);
            if (authCust) {
                const nm = document.getElementById('acName'); if (nm) nm.textContent = authCust.name || '';
                document.getElementById('acPhone').textContent = authCust.phone || authCust.email || '';
                const av = document.getElementById('acAvaImg');
                if (av) av.innerHTML = authCust.avatar ? '<img src="' + esc(authCust.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<svg class="ico" aria-hidden="true"><use href="#i-user"/></svg>';
            }
        }
        async function authInit() {
            applyAuthLang();
            authToken = authStoreGet();
            try {
                const r = await fetchRetry(`${RAILWAY_API_URL}/api/auth/config`, 2);
                const cfg = await r.json(); authEnabled = !!cfg.enabled; authProvider = cfg.provider || null; tgClientId = cfg.client_id || ''; googleClientId = cfg.google_client_id || ''; ttClientKey = cfg.tiktok_client_key || '';
            } catch (e) { authEnabled = false; }
            const btn = document.getElementById('accountBtn'); if (btn) btn.style.display = authEnabled ? 'flex' : 'none';
            if (authEnabled && authToken) {
                try {
                    const r = await fetch(`${RAILWAY_API_URL}/api/auth/me`, { headers: authHeaders(), cache: 'no-store' });
                    if (r.status === 401) clearAuth();
                    else { const j = await r.json(); authCust = j.customer; authStoreSet(authToken); }
                } catch (e) { /* offline: keep the token, try again next time */ }
            } else if (!authEnabled) { authToken = null; }
            updateAcctUi();
        }
        function needLogin() { return authEnabled && !authToken; }

        function openAccount() {
            if (!authEnabled) return;
            authMeta = null;
            applyAuthLang();
            if (authToken) { acRenderName(); openModal('acctModal'); wlLoad(); tierLoad(); openOrders(); } else openAuth();
        }
        function openAuth(after) {
            authPending = after || null;
            applyAuthLang();
            try { const n = localStorage.getItem('oneday_cust_name'), p = localStorage.getItem('oneday_cust_phone'); if (n && !document.getElementById('auName').value) document.getElementById('auName').value = n; if (p && !document.getElementById('auPhone').value) document.getElementById('auPhone').value = p; } catch (e) {}
            auShowStep(authProvider === 'gateway' ? 1 : 0); openModal('authModal'); ggInit(); auAnimate();
        }
        let auLoadTimer = null;
        function auReset() {   // back to the normal look (modal re-opened, error, or the browser Back button)
            clearTimeout(auLoadTimer);
            document.querySelectorAll('#authModal .au-sso').forEach(el => el.classList.remove('loading', 'dim'));
            document.querySelectorAll('#authModal .au-rip').forEach(r => r.remove());
            applyAuthLang();
        }
        function auPress(btn, x, y) {   // ripple under the finger + spinner on the tapped button, the others fade
            if (!btn || btn.classList.contains('loading')) return;
            const r = btn.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
            const rip = document.createElement('i'); rip.className = 'au-rip';
            rip.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + ((x == null ? r.width / 2 : x - r.left) - d / 2) + 'px;top:' + ((y == null ? r.height / 2 : y - r.top) - d / 2) + 'px';
            btn.appendChild(rip); setTimeout(() => rip.remove(), 700);
            btn.classList.add('loading');
            const sp = btn.querySelector('span'); if (sp) sp.textContent = at('connecting');
            document.querySelectorAll('#authModal .au-sso').forEach(o => { if (o !== btn && o.offsetParent) o.classList.add('dim'); });
            clearTimeout(auLoadTimer); auLoadTimer = setTimeout(auReset, 15000);
        }
        document.getElementById('authModal').addEventListener('pointerdown', (e) => {
            const b = e.target.closest('.au-sso');
            if (b && !b.querySelector('#auGoogleBtn')) auPress(b, e.clientX, e.clientY);   // Telegram / TikTok
        });
        // Google's real button lives in a cross-origin iframe: a tap on it moves focus into the iframe
        window.addEventListener('blur', () => setTimeout(() => {
            const a = document.activeElement;
            if (a && a.tagName === 'IFRAME' && a.closest('#auGoogleBtn')) auPress(a.closest('.au-sso'));
        }, 0));
        window.addEventListener('focus', () => {   // Google popup closed without signing in
            const g = document.getElementById('auGoogleBtn'), w = g && g.closest('.au-sso');
            if (w && w.classList.contains('loading')) setTimeout(() => { if (!window.__ggBusy) auReset(); }, 1500);
        });
        window.addEventListener('pageshow', (e) => { if (e.persisted) auReset(); });
        function auAnimate() {   // replay the staggered entrance of the login buttons every time the modal opens
            let i = 0;
            document.querySelectorAll('#authModal .au-sso').forEach(el => {
                if (!el.offsetParent) return;
                el.style.animation = 'none'; void el.offsetWidth;
                el.style.animation = ''; el.style.animationDelay = (i++ * 80) + 'ms';
            });
        }
        function auShowStep(n) {
            auReset();
            const tgOn = authProvider === 'telegram';
            document.getElementById('auStepTg').style.display = (n === 0 && tgOn) ? '' : 'none';
            document.getElementById('auTgBtn').style.display = tgOn ? '' : 'none';
            document.getElementById('auGoogleBox').style.display = (googleClientId && n !== 2) ? '' : 'none';
            document.getElementById('auTtBox').style.display = (ttClientKey && n !== 2) ? '' : 'none';
            document.getElementById('auStep1').style.display = n === 1 ? '' : 'none';
            document.getElementById('auStep2').style.display = n === 2 ? '' : 'none';
            auClear();
        }
        function auErr(step, msg) { const e = document.getElementById('auErr' + step); e.querySelector('span').textContent = msg; e.classList.add('show'); }
        function auClear() { document.querySelectorAll('#authModal .au-err').forEach(e => e.classList.remove('show')); document.querySelectorAll('#authModal .au-input').forEach(e => e.classList.remove('bad')); }
        function auBack() { clearInterval(auTimer); auShowStep(1); }
        function auCooldown(sec) {
            clearInterval(auTimer);
            const btn = document.getElementById('auResend'), txt = document.getElementById('auResendTxt');
            let left = sec; btn.disabled = true; txt.textContent = at('resend_in') + left + 's';
            auTimer = setInterval(() => { left--; if (left <= 0) { clearInterval(auTimer); btn.disabled = false; txt.textContent = at('resend'); } else txt.textContent = at('resend_in') + left + 's'; }, 1000);
        }
        async function auRequest(isResend) {
            const nameEl = document.getElementById('auName'), phoneEl = document.getElementById('auPhone');
            const name = nameEl.value.trim(), phone = phoneEl.value.trim();
            auClear();
            if (!name) { nameEl.classList.add('bad'); return auErr(1, at('err_name')); }
            if (phone.replace(/\D/g, '').length < 8) { phoneEl.classList.add('bad'); return auErr(1, at('err_phone')); }
            const btn = document.getElementById('auNext'); btn.disabled = true;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) });
                const j = await r.json().catch(() => ({}));
                const st = j.status;
                const E = (m) => { if (isResend) auErr(2, m); else auErr(1, m); };
                if (st === 'sent') {
                    auPhoneVal = phone; document.getElementById('auShownPhone').textContent = phone;
                    auShowStep(2); auCooldown(30);
                    const c = document.getElementById('auCode'); c.value = ''; setTimeout(() => c.focus(), 80);
                } else if (st === 'no_telegram') E(at('err_no_tg'));
                else if (st === 'wait') E(at('err_wait'));
                else if (st === 'too_many') E(at('err_many'));
                else if (st === 'bad_phone') { phoneEl.classList.add('bad'); E(at('err_phone')); }
                else if (st === 'bad_name') { nameEl.classList.add('bad'); E(at('err_name')); }
                else E(at('err_send'));
            } catch (e) { (isResend ? auErr(2, at('err_net')) : auErr(1, at('err_net'))); }
            btn.disabled = false;
        }
        function auCodeInput() {
            const c = document.getElementById('auCode'); c.value = c.value.replace(/\D/g, '').slice(0, 4); auClear();
            if (c.value.length === 4) auVerify();
        }
        let auBusy = false;
        async function auVerify() {
            const code = document.getElementById('auCode').value.trim();
            if (auBusy) return;
            if (!/^\d{4}$/.test(code)) return auErr(2, at('err_wrong'));
            auBusy = true; const btn = document.getElementById('auVerify'); btn.disabled = true;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: auPhoneVal, code }) });
                const j = await r.json().catch(() => ({}));
                if (j.ok) {
                    authToken = j.token; authCust = j.customer; authStoreSet(authToken); updateAcctUi();
                    try { localStorage.setItem('oneday_cust_name', authCust.name || ''); localStorage.setItem('oneday_cust_phone', authCust.phone || ''); } catch (e) {}
                    clearInterval(auTimer); closeModal('authModal');
                    const f = authPending; authPending = null; if (f) setTimeout(f, 250);
                } else {
                    const m = j.error === 'expired' ? at('err_expired') : j.error === 'locked' ? at('err_locked') : j.error === 'too_many' ? at('err_many') : at('err_wrong');
                    document.getElementById('auCode').classList.add('bad'); auErr(2, m);
                }
            } catch (e) { auErr(2, at('err_net')); }
            auBusy = false; btn.disabled = false;
        }
        async function authLogout() {
            if (!(await uiConfirm('logout', UI_CFM_MSG.logout[_dlgLang()]))) return;
            try { fetch(`${RAILWAY_API_URL}/api/auth/logout`, { method: 'POST', headers: authHeaders() }); } catch (e) {}
            clearAuth(); closeModal('acctModal');
        }

        // ---- My orders ----
        function odChip(cls, icon, text) { return `<span class="od-chip ${cls}"><svg class="ico" aria-hidden="true"><use href="#i-${icon}"/></svg>${esc(text)}</span>`; }
