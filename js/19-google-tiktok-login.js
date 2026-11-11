        /* ---- Continue with Google (Gmail) ---- */
        function ggInit() {
            if (!googleClientId) return;
            const go = () => {
                if (ggReady || !window.google || !google.accounts || !google.accounts.id) return;
                ggReady = true;
                google.accounts.id.initialize({ client_id: googleClientId, callback: ggCallback, auto_select: false, ux_mode: 'popup' });
                const box = document.getElementById('auGoogleBtn'); box.innerHTML = '';
                google.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(400, Math.max(200, Math.floor(document.getElementById('auGoogleBox').clientWidth || 300))) });
            };
            if (window.google && google.accounts) return go();
            if (document.getElementById('gsiScript')) { setTimeout(go, 800); return; }
            const sc = document.createElement('script'); sc.id = 'gsiScript'; sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = go;
            sc.onerror = () => auErr('Gg', at('err_net'));
            document.head.appendChild(sc);
        }
        async function ggCallback(resp) {
            auClear(); window.__ggBusy = true;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: resp.credential }) });
                const j = await r.json().catch(() => ({}));
                if (j.ok) {
                    authToken = j.token; authCust = j.customer; authStoreSet(authToken); updateAcctUi();
                    try { localStorage.setItem('oneday_cust_name', authCust.name || ''); } catch (e) {}
                    closeModal('authModal');
                    const f = authPending; authPending = null; if (f) setTimeout(f, 250);
                } else { auErr('Gg', at('err_tg')); window.__ggBusy = false; auReset(); }
            } catch (e) { auErr('Gg', at('err_net')); window.__ggBusy = false; auReset(); }
        }
        /* ---- Continue with TikTok (Login Kit: authorization code, exchanged on the server) ---- */
        const TT_PENDING = 'oneday_tt_pending';
        function ttStart() {
            auClear();
            try {
                const state = rnd(16);
                try { localStorage.setItem(TT_PENDING, JSON.stringify({ state, t: Date.now() })); } catch (e) {}
                saveCartForRedirect();
                location.href = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
                    client_key: ttClientKey, scope: 'user.info.basic', response_type: 'code', redirect_uri: tgRedirect(), state
                }).toString();
            } catch (e) { auErr('Tt', at('err_tg')); }
        }
        async function ttFinish(code, state) {
            let p = null;
            try { p = JSON.parse(localStorage.getItem(TT_PENDING) || 'null'); } catch (e) {}
            try { localStorage.removeItem(TT_PENDING); } catch (e) {}
            if (!p || p.state !== state || Date.now() - p.t > 15 * 60 * 1000) return;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/auth/tiktok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, redirect_uri: tgRedirect() }) });
                const j = await r.json().catch(() => ({}));
                if (j.ok) {
                    authToken = j.token; authCust = j.customer; authStoreSet(authToken); updateAcctUi();
                    try { localStorage.setItem('oneday_cust_name', authCust.name || ''); } catch (e) {}
                    closeModal('authModal');
                    const f = authPending; authPending = null; if (f) setTimeout(f, 250);
                    restoreCartAfterLogin();
                } else { openModal('authModal'); auShowStep(0); auErr('Tt', at('err_tg')); }
            } catch (e) { openModal('authModal'); auShowStep(0); auErr('Tt', at('err_net')); }
        }
        async function tgStart() {
            auClear(); tgBusy(true);
            try {
                const verifier = rnd(48), state = rnd(16);
                const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
                try { localStorage.setItem(TG_PENDING, JSON.stringify({ state, verifier, t: Date.now() })); } catch (e) {}
                saveCartForRedirect();
                const url = 'https://oauth.telegram.org/auth?' + new URLSearchParams({
                    client_id: tgClientId, redirect_uri: tgRedirect(), response_type: 'code', scope: 'openid profile phone',
                    state, code_challenge: challenge, code_challenge_method: 'S256'
                }).toString();
                location.href = url;     // full-page redirect: the most reliable on phones (no popups)
            } catch (e) { tgBusy(false); auErr('Tg', at('err_tg')); }
        }
        async function tgFinish(code, state) {
            let p = null;
            try { p = JSON.parse(localStorage.getItem(TG_PENDING) || 'null'); } catch (e) {}
            try { localStorage.removeItem(TG_PENDING); } catch (e) {}
            if (!p || p.state !== state || Date.now() - p.t > 15 * 60 * 1000) { tgBusy(false); return; }
            try { if (tgPopup && !tgPopup.closed) tgPopup.close(); } catch (e) {}
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/auth/telegram`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: p.verifier, redirect_uri: tgRedirect() }) });
                const j = await r.json().catch(() => ({}));
                tgBusy(false);
                if (j.ok) {
                    authToken = j.token; authCust = j.customer; authStoreSet(authToken); updateAcctUi();
                    try { localStorage.setItem('oneday_cust_name', authCust.name || ''); localStorage.setItem('oneday_cust_phone', authCust.phone || ''); } catch (e) {}
                    closeModal('authModal');
                    const f = authPending; authPending = null; if (f) setTimeout(f, 250);
                    restoreCartAfterLogin();
                } else {
                    openModal('authModal'); auShowStep(0);
                    auErr('Tg', j.error === 'no_phone' ? at('err_tg_phone') : at('err_tg'));
                }
            } catch (e) { tgBusy(false); openModal('authModal'); auShowStep(0); auErr('Tg', at('err_net')); }
        }
        window.addEventListener('message', (e) => {
            if (e.origin === location.origin && e.data && e.data.type === 'oneday-tg') tgFinish(e.data.code, e.data.state);
        });
        // This page was opened by Telegram as the redirect target (?code=...&state=...)
        window.__tgReturn = (function () {
            const q = new URLSearchParams(location.search);
            if (!q.get('state') || !(q.get('code') || q.get('error'))) return null;
            let prov = 'tg'; try { const tp = JSON.parse(localStorage.getItem('oneday_tt_pending') || 'null'); if (tp && tp.state === q.get('state')) prov = 'tt'; } catch (e) {}
            const r = { code: q.get('code') || '', state: q.get('state'), prov };
            try { history.replaceState(null, '', location.pathname); } catch (e) {}
            if (window.opener && window.opener !== window) {
                try { window.opener.postMessage({ type: 'oneday-tg', code: r.code, state: r.state }, location.origin); } catch (e) {}
                document.body.innerHTML = '<p style="font:16px sans-serif;text-align:center;margin-top:40vh">✓</p>';
                setTimeout(() => window.close(), 300);
                return 'popup';
            }
            return r.code ? r : null;
        })();
        authInit().then(() => { const R = window.__tgReturn; if (R && R !== 'popup') { R.prov === 'tt' ? ttFinish(R.code, R.state) : tgFinish(R.code, R.state); } });
