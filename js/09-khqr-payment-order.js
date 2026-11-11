        // ---------------- KHQR / Bakong ----------------
        let khqrEnabled = false;
        let khqrPollTimer = null;
        let khqrCountTimer = null;
        let khqrBusy = false;
        let khqrPollNow = null;

        // coming back from the bank app / reconnecting: check right away instead of waiting for the next tick
        ['visibilitychange', 'focus', 'online'].forEach(ev => window.addEventListener(ev, () => {
            if (khqrPollNow && document.visibilityState !== 'hidden') khqrPollNow(true);
        }));

        async function loadPaymentConfig() {
            try {
                let r = await fetch(`${RAILWAY_API_URL}/api/payment-config`, { cache: 'no-store' });
                let cfg = await r.json();
                khqrEnabled = !!cfg.khqr_enabled;
                document.getElementById('payRowKhqr').style.display = cfg.khqr_enabled ? 'flex' : 'none';
                // default to the first online method, otherwise cash on delivery
                let first = cfg.khqr_enabled ? 'khqr' : 'cod';
                let radio = document.querySelector(`input[name="payMethod"][value="${first}"]`);
                if (radio) radio.checked = true;
            } catch (e) { khqrEnabled = false; }
            let box = document.getElementById('paymentMethodBox');
            if (box) box.style.display = khqrEnabled ? 'block' : 'none';
        }

        function stopKhqrTimers() {
            if (khqrPollTimer) { clearInterval(khqrPollTimer); khqrPollTimer = null; }
            if (khqrCountTimer) { clearInterval(khqrCountTimer); khqrCountTimer = null; }
            khqrPollNow = null;
        }

        function closeKhqrModal() {
            let fly = null;
            if (khqrPlanePending) {
                khqrPlanePending = false;
                const src = document.getElementById('khqrDoneBtn');
                const rc = src && src.offsetWidth ? src.getBoundingClientRect() : null;
                fly = rc ? [rc.left + rc.width / 2, rc.top + rc.height / 2] : [window.innerWidth / 2, window.innerHeight / 2];
            }
            stopKhqrTimers();
            closeModal('khqrModal');
            if (fly) setTimeout(() => flyStarsToAccount(fly[0], fly[1]), 200);
        }

        // ✨ After a successful payment, when the customer closes the result popup, a burst of golden stars and sparkles
        // flies from the close button along smooth curves to the Account button, shedding glitter; the button flashes on arrival.
        (function () { const n = document.getElementById('mainNav'); if (!n) return;
            const f = () => n.classList.toggle('is-scrolled', window.scrollY > 8);
            window.addEventListener('scroll', f, { passive: true }); f(); })();
        let khqrPlanePending = false;
        function flyStarsToAccount(sx, sy) {
            try {
                if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                const btn = document.getElementById('accountBtn');
                if (!btn || !btn.animate) return;
                const b = btn.getBoundingClientRect();
                if (!b.width) return;                         // account button hidden (login disabled)
                const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
                // The header scrolls away with the page, so bring it back into view and keep aiming at the button's LIVE position.
                if (b.top < 0 || b.bottom > H) window.scrollTo({ top: 0, behavior: 'smooth' });
                let ex = Math.min(Math.max(b.left + b.width / 2, 14), W - 14);
                let ey = Math.min(Math.max(b.top + b.height / 2, 14), H - 14);
                const trackBtn = () => {
                    const c = btn.getBoundingClientRect();
                    ex = Math.min(Math.max(c.left + c.width / 2, 14), W - 14);
                    ey = Math.min(Math.max(c.top + c.height / 2, 14), H - 14);
                };
                const cv = document.createElement('canvas');
                cv.width = W * dpr; cv.height = H * dpr;
                cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:100000;pointer-events:none';
                document.body.appendChild(cv);
                const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
                const r = (min, max) => min + Math.random() * (max - min);
                // every star picks its own random colour: [light, mid, dark] gradient + glow
                const PALS = [
                    { c: ['#fff3a3', '#ffd54a', '#ffb300'], glow: 'rgba(255,190,40,.95)' },   // gold
                    { c: ['#ffd1e8', '#ff6fb5', '#e0208a'], glow: 'rgba(255,90,170,.95)' },   // pink
                    { c: ['#d4f3ff', '#4fc3ff', '#1d7fe0'], glow: 'rgba(60,170,255,.95)' },   // sky blue
                    { c: ['#d9ffe6', '#4be08a', '#0fa84f'], glow: 'rgba(60,220,130,.95)' },   // green
                    { c: ['#e9dcff', '#a77bff', '#6a35e0'], glow: 'rgba(150,110,255,.95)' },  // violet
                    { c: ['#ffe0c2', '#ff9a3c', '#f05a00'], glow: 'rgba(255,140,50,.95)' },   // orange
                    { c: ['#ffd0d0', '#ff5a5a', '#d61f1f'], glow: 'rgba(255,80,80,.95)' },    // red
                    { c: ['#ffffff', '#f3f7ff', '#c9dcff'], glow: 'rgba(200,225,255,.95)' }   // white
                ];
                const rp = () => PALS[(Math.random() * PALS.length) | 0];
                const STARS = 16;
                const stars = [], glitter = [];
                for (let i = 0; i < STARS; i++) {
                    const burstA = r(0, 6.283), burstR = r(70, 170);      // first swoosh outward in a random direction
                    const side = (Math.random() < .5 ? -1 : 1) * r(40, 130);
                    const sparkle = i % 4 === 3;                          // every 4th is a white 4-point sparkle
                    stars.push({
                        p0: [sx, sy],
                        p1: [sx + Math.cos(burstA) * burstR, sy + Math.sin(burstA) * burstR],
                        side,
                        delay: r(0, 520), dur: r(1500, 2200),
                        R: sparkle ? r(9, 13) : r(8, 15), spin: r(-5, 5), rot0: r(0, 6.28), phase: r(0, 6.28),
                        sparkle, pal: rp(), arrived: false, done: false, last: null
                    });
                }
                function starPath(x, y, R, rIn, n, rot) {
                    ctx.beginPath();
                    for (let i = 0; i < n * 2; i++) {
                        const rad = i % 2 ? rIn : R, ang = rot + i * Math.PI / n - Math.PI / 2;
                        const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
                        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                    }
                    ctx.closePath();
                }
                function drawStar(x, y, R, rot, pal, sparkle, alpha) {
                    const cols = pal.c;
                    ctx.save(); ctx.globalAlpha = alpha;
                    ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
                    const g = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
                    g.addColorStop(0, cols[0]); g.addColorStop(.55, cols[1]); g.addColorStop(1, cols[2]);
                    ctx.fillStyle = g;
                    sparkle ? starPath(x, y, R * 1.15, R * 0.22, 4, rot) : starPath(x, y, R, R * 0.46, 5, rot);
                    ctx.fill();
                    ctx.shadowBlur = 0; ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
                    ctx.restore();
                }
                const bez = (p, t) => {
                    const u = 1 - t, dist = Math.hypot(ex - sx, ey - sy) || 1;
                    const nx = -(ey - sy) / dist, ny = (ex - sx) / dist;       // sideways direction, recomputed because the target can move
                    const c2x = ex + nx * p.side, c2y = ey + ny * p.side;
                    return [
                        u*u*u*p.p0[0] + 3*u*u*t*p.p1[0] + 3*u*t*t*c2x + t*t*t*ex,
                        u*u*u*p.p0[1] + 3*u*u*t*p.p1[1] + 3*u*t*t*c2y + t*t*t*ey]; };
                const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;     // easeInOutSine
                const spawnGlitter = (x, y, n, spread, big, pal) => {
                    for (let i = 0; i < n && glitter.length < 420; i++) {
                        const a = r(0, 6.283), v = r(0.2, 1) * spread;
                        glitter.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (big ? 0 : 0.3), born: 0, life: r(450, 900), s: r(1.2, big ? 3.6 : 2.6), c: Math.random() < .2 ? '#ffffff' : (pal || rp()).c[(Math.random() * 3) | 0], sp: Math.random() < .35 });
                    }
                };
                const pulse = (strong) => btn.animate([
                    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,193,7,.8)' },
                    { transform: 'scale(' + (strong ? 1.5 : 1.22) + ')', boxShadow: '0 0 0 ' + (strong ? 22 : 12) + 'px rgba(255,193,7,0)' },
                    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,193,7,0)' }], { duration: strong ? 900 : 450, easing: 'ease-out' });
                spawnGlitter(sx, sy, 28, 3.2, true);                       // little flash at take-off
                const t0 = performance.now();
                let lastT = t0, lastPulse = 0, arrivedCount = 0;
                function frame(now) {
                    const dt = Math.min(now - lastT, 40); lastT = now;
                    ctx.clearRect(0, 0, W, H);
                    trackBtn();
                    let alive = false;
                    for (const s of stars) {
                        const el = now - t0 - s.delay;
                        if (el < 0) { alive = true; continue; }
                        if (el <= s.dur) {
                            alive = true;
                            const t = el / s.dur, pt = bez(s, ease(t));
                            let sc = t < .12 ? 0.15 + t / .12 * 0.85 : (t > .88 ? 1 - (t - .88) / .12 * 0.75 : 1);
                            sc *= 1 + 0.2 * Math.sin(now * 0.018 + s.phase);   // twinkle
                            drawStar(pt[0], pt[1], s.R * sc, s.rot0 + s.spin * (el / 1000), s.pal, s.sparkle, t > .96 ? (1 - t) / .04 : 1);
                            spawnGlitter(pt[0], pt[1], 1 + (Math.random() < .5 ? 1 : 0), 0.35, false, s.pal);
                        } else if (!s.done) {
                            s.done = true; arrivedCount++;
                            spawnGlitter(ex, ey, 7, 2.2, true, s.pal);
                            if (now - lastPulse > 160) { lastPulse = now; pulse(false); }
                        }
                    }
                    // glitter: tiny drifting dots / sparkles that fade out
                    for (let i = glitter.length - 1; i >= 0; i--) {
                        const g = glitter[i]; g.born += dt;
                        if (g.born >= g.life) { glitter.splice(i, 1); continue; }
                        g.x += g.vx * dt / 16; g.y += g.vy * dt / 16; g.vy += 0.012 * dt / 16;
                        const k = 1 - g.born / g.life;
                        ctx.globalAlpha = k * k; ctx.fillStyle = g.c;
                        if (g.sp) { ctx.shadowColor = g.c; ctx.shadowBlur = 6; starPath(g.x, g.y, g.s * 1.8, g.s * 0.4, 4, 0); ctx.fill(); ctx.shadowBlur = 0; }
                        else { ctx.beginPath(); ctx.arc(g.x, g.y, g.s * (0.5 + 0.5 * k), 0, 6.283); ctx.fill(); }
                    }
                    ctx.globalAlpha = 1;
                    if (alive || glitter.length) requestAnimationFrame(frame);
                    else { cv.remove(); pulse(true); }                   // last star landed: big golden flash on the Account button
                }
                requestAnimationFrame(frame);
            } catch (e) { /* purely decorative: never break the payment screen */ }
        }

        function showKhqrResult(text, ok) {
            stopKhqrTimers();
            const content = document.querySelector('#khqrModal .modal-content');
            const body = document.getElementById('khqrBody');
            khqrPlanePending = false;
            if (ok) {
                const t = translations[currentLang];
                const sub = String(text).replace(/\{\{\w+\}\}\s*/g, '');
                if (content) content.classList.add('kq-success');
                body.innerHTML =
                    '<div class="ty-wrap">' +
                        '<div class="kq-confetti" id="kqConfetti"></div>' +
                        '<div class="ty-badge"><svg viewBox="0 0 52 52" aria-hidden="true"><path class="tick" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div>' +
                        '<div class="ty-brand"><img src="images/oneday_clothing_logo_180x180.png" alt=""><span class="ty-name"><b>One</b>day<em>.</em></span></div>' +
                        '<div class="ty-title">' + (t.ty_title || 'Thank you!') + '</div>' +
                        '<div class="ty-sub">' + sub + '</div>' +
                        (khqrAmountText ? '<div class="ty-amount">' + ico('check') + ' ' + khqrAmountText + '</div>' : '') +
                    '</div>';
                launchConfetti(document.getElementById('kqConfetti'));
                khqrPlanePending = true;   // planes take off when the customer closes this popup
            } else {
                body.innerHTML =
                    '<div class="pay-result"><div class="pay-result-icon warn">' + ico('hourglass') + '</div>' +
                    '<div class="pay-result-text" style="color:#f59e0b;">' + iconize(text) + '</div></div>';
            }
            document.getElementById('khqrDoneBtn').style.display = 'flex';
        }

        // Automatic checking is unavailable (Bakong quota/outage): let the customer ask the shop to confirm by hand.
        function updateKhqrNotice(manual, degraded) {
            let notice = document.getElementById('khqrNotice');
            let btn = document.getElementById('khqrClaimBtn');
            if (!notice || !btn) return;
            let t = translations[currentLang];
            if (manual) {
                notice.innerHTML = iconize(t.khqr_manual); notice.style.display = 'block'; btn.style.display = 'none';
            } else if (degraded) {
                notice.innerHTML = iconize(t.khqr_degraded); notice.style.display = 'block'; btn.style.display = 'flex';
            } else {
                notice.style.display = 'none'; btn.style.display = 'none';
            }
        }

        async function claimKhqrPayment(md5) {
            let btn = document.getElementById('khqrClaimBtn');
            if (btn) btn.disabled = true;
            try {
                let r = await fetch(`${RAILWAY_API_URL}/api/payment-claim/${md5}`, { method: 'POST' });
                let j = await r.json();
                if (j.ok) { updateKhqrNotice(true, true); return; }
            } catch (e) { /* fall through and let the customer retry */ }
            if (btn) btn.disabled = false;
        }

        let khqrAmountText = '';
        function buildKhqrBody(t, md5) {
            return `
                <div class="kq-merchant">
                    <img src="images/oneday_clothing_logo_180x180.png" alt="Oneday">
                    <div><div class="kq-m-name">Oneday Cambodia</div><div class="kq-m-sub">KHQR · BAKONG</div></div>
                </div>
                <div class="kq-amount" id="khqrAmount"></div>
                <div class="kq-qr">
                    <div id="khqrQrBox" class="kq-qr-box"></div>
                    <span class="kq-corner tl"></span><span class="kq-corner tr"></span><span class="kq-corner bl"></span><span class="kq-corner br"></span>
                    <div class="kq-scan"></div>
                </div>
                <div><span class="kq-status" id="khqrStatus">${iconize(t.khqr_waiting)}</span></div>
                <div class="kq-timer">
                    <div class="kq-bar"><i id="khqrBar"></i></div>
                    <div class="kq-time">${t.khqr_expires_in} <b id="khqrCountdown"></b></div>
                </div>
                <div class="kq-hint" id="khqrHint">${t.khqr_hint}</div>
                <div id="khqrNotice" style="display:none; font-size:13px; font-weight:700; line-height:1.5; margin-top:12px; padding:10px 12px; border-radius:12px; background:rgba(245,158,11,0.12); color:#b45309;"></div>
                <button type="button" id="khqrClaimBtn" class="btn-modal-telegram" style="display:none; margin-top:10px;" onclick="claimKhqrPayment('${md5}')"><span>${iconize(t.khqr_claim)}</span></button>
                <button type="button" class="kq-btn-ghost" onclick="if (khqrPollNow) khqrPollNow(true)"><span>${iconize(t.khqr_check)}</span></button>`;
        }

        function launchConfetti(box) {
            const colors = ['#0284c7', '#38bdf8', '#22c55e', '#f59e0b', '#ec4899', '#a78bfa'];
            for (let i = 0; i < 44; i++) {
                const p = document.createElement('i');
                const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140;
                p.style.setProperty('--dx', Math.cos(a) * d + 'px');
                p.style.setProperty('--dy', (Math.sin(a) * d - 50) + 'px');
                p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
                p.style.background = colors[i % colors.length];
                p.style.width = (5 + Math.random() * 5) + 'px';
                p.style.height = (8 + Math.random() * 6) + 'px';
                p.style.animationDelay = (0.55 + Math.random() * 0.2) + 's';
                box.appendChild(p);
            }
        }

        async function startKhqrPayment(orderData, method) {
            if (khqrBusy) return;
            khqrBusy = true;
            let t = translations[currentLang];
            try {
                let response = await fetch(`${RAILWAY_API_URL}/api/order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify({ ...orderData, payment_method: method })
                });
                let result = await response.json();
                if (result && result.need_login) { clearAuth(); openAuth(); return; }
                if (!result.success) {
                    uiAlert(result.message || result.error || "មានបញ្ហាពេលកុម្មង់ទំនិញ!", 'error');
                    return;
                }

                // Reset the modal (it may have shown an earlier result) and draw the QR
                const kqContent = document.querySelector('#khqrModal .modal-content');
                if (kqContent) kqContent.classList.remove('kq-success');
                document.getElementById('khqrBody').innerHTML = buildKhqrBody(t, result.md5);
                document.getElementById('khqrDoneBtn').style.display = 'none';
                khqrAmountText = '$' + Number(result.amount).toFixed(2);
                document.getElementById('khqrAmount').innerText = khqrAmountText;
                new QRCode(document.getElementById('khqrQrBox'), {
                    text: result.qr, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M
                });

                closeModal('checkoutModal');
                closeModal('cartModal');
                openModal('khqrModal');

                stopKhqrTimers();
                let expiresAt = result.expires_at;
                let totalMs = Math.max(1000, expiresAt - Date.now());
                let tick = () => {
                    let left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
                    let bar = document.getElementById('khqrBar');
                    if (bar) { bar.style.width = Math.min(100, (expiresAt - Date.now()) / totalMs * 100) + '%'; if (left < 60) bar.style.background = 'linear-gradient(90deg,#fbbf24,#f59e0b)'; }
                    let el = document.getElementById('khqrCountdown');
                    if (el) el.innerText = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
                };
                tick();
                khqrCountTimer = setInterval(tick, 1000);

                // One status check, with a hard timeout: a fetch that hangs (common on phones when the
                // browser is sent to the background to open the bank app) can never block later checks.
                let polling = false;
                khqrPollNow = async (manual) => {
                    if (polling && !manual) return;
                    polling = true;
                    let ctrl = new AbortController();
                    let timeout = setTimeout(() => ctrl.abort(), 8000);
                    try {
                        let r = await fetch(`${RAILWAY_API_URL}/api/payment-status/${result.md5}${manual === true ? '?force=1' : ''}`, { cache: 'no-store', signal: ctrl.signal });
                        let s = await r.json();
                        if (s.status === 'PAID') {
                            cart = {};
                            renderCart();
                            updateAllCardStocks();
                            showKhqrResult(translations[currentLang].khqr_paid, true);
                        } else if (s.status === 'EXPIRED' || s.status === 'NOT_FOUND') {
                            showKhqrResult(translations[currentLang].khqr_expired, false);
                            backgroundSyncStock();
                        } else if (s.status === 'WAITING') {
                            updateKhqrNotice(!!s.manual, !!s.degraded);
                        }
                    } catch (e) { /* network blip: the next check will try again */ }
                    clearTimeout(timeout);
                    polling = false;
                };
                khqrPollTimer = setInterval(() => khqrPollNow(), 3000);
                khqrPollNow();
            } catch (error) {
                console.error("KHQR order error:", error);
                uiAlert("មិនអាចភ្ជាប់ទៅកាន់ Server លើ Railway បានទេ!", 'network');
            } finally {
                khqrBusy = false;
            }
        }

        async function openTelegram() {
            if (Object.keys(cart).length === 0) {
                uiAlert(translations[currentLang].empty_cart, 'cart');
                return;
            }

            let nameInput = document.getElementById('custName');
            let phoneInput = document.getElementById('custPhone');
            let addressInput = document.getElementById('custAddress');
            let mapUrlInput = document.getElementById('custMapUrl');

            let name = nameInput.value.trim();
            let phone = phoneInput.value.trim();
            let address = addressInput.value.trim();
            let mapUrl = mapUrlInput ? mapUrlInput.value.trim() : '';

            let hasError = false;
            if (!name) { nameInput.classList.add('error'); hasError = true; }
            if (!phone) { phoneInput.classList.add('error'); hasError = true; }
            if (!address) { addressInput.classList.add('error'); hasError = true; }

            if (hasError) {
                shakeErrors();
                showToast(translations[currentLang].alert_fill);
                return;
            }

            let cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.length < 8) {
                phoneInput.classList.add('error');
                shakeErrors();
                showToast(translations[currentLang].alert_phone_invalid);
                return;
            }

            {   // ask the customer to confirm before anything is sent
                let _tp = document.getElementById('total-price');
                let _tot = _tp ? _tp.textContent.trim() : '';
                let _msg = UI_CFM_MSG.order[_dlgLang()] + (_tot ? ': ' + _tot : '?');
                if (!(await uiConfirm('order', _msg))) return;
            }

            saveUserInfo();

            let tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
            let userId = tgUser ? tgUser.id : "";
            let username = tgUser ? tgUser.username : "";

            let formattedCart = {};
            for (let key in cart) {
                let item = cart[key];
                let prod = item.product;
                let titleKey = currentLang === 'en' ? (prod.title_en || prod.title_km) : currentLang === 'zh' ? (prod.title_zh || prod.title_km) : prod.title_km;
                formattedCart[key] = {
                    titleKey: titleKey,
                    price: item.price,
                    size: item.size,
                    ref: item.ref,
                    qty: item.qty
                };
            }

            let orderData = {
                customer: { name, phone, address, mapUrl, userId, username },
                items: formattedCart
            };

            // Pay-now path: the server creates the order + KHQR, then we wait for Bakong to confirm.
            let payChoice = document.querySelector('input[name="payMethod"]:checked');
            if (payChoice && payChoice.value === 'wallet') { await startWalletPayment(orderData); return; }
            if (khqrEnabled && payChoice && payChoice.value === 'khqr') {
                await startKhqrPayment(orderData, payChoice.value);
                return;
            }

            try {
                let response = await fetch(`${RAILWAY_API_URL}/api/order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify(orderData)
                });

                let result = await response.json();
                if (result && result.need_login) { clearAuth(); openAuth(); return; }
                if (result.success) {
                    let t = translations[currentLang];

                    let message = `${t.tg_title}\n\n`;
                    message += `${t.tg_customer}\n`;
                    message += `${t.tg_name}${name}\n`;
                    message += `${t.tg_phone}${phone}\n`;
                    message += `${t.tg_address}${address}\n`;
                    if (mapUrl) {
                        let cleanCoords = mapUrl.replace(/\s+/g, '');
                        message += `${t.tg_map}${mapUrl}\n`;
                        message += `${t.tg_gmap}https://www.google.com/maps?q=${cleanCoords}\n`;
                    }
                    message += `\n${t.tg_items}\n`;

                    let index = 1;
                    let subtotalPrice = 0;

                    const sizeOrder = { 'S': 1, 'M': 2, 'L': 3, 'XL': 4, 'XXL': 5 };
                    let sortedKeys = Object.keys(cart).sort((a, b) => {
                        let itemA = cart[a];
                        let itemB = cart[b];
                        let refA = parseInt(itemA.ref) || 0;
                        let refB = parseInt(itemB.ref) || 0;
                        if (refA !== refB) return refA - refB;
                        return (sizeOrder[itemA.size] || 99) - (sizeOrder[itemB.size] || 99);
                    });

                    for (let key of sortedKeys) {
                        let item = cart[key];
                        let itemTotal = item.price * item.qty;
                        subtotalPrice += itemTotal;
                        
                        let prod = item.product;
                        let titleText = currentLang === 'en' ? (prod.title_en || prod.title_km) : currentLang === 'zh' ? (prod.title_zh || prod.title_km) : prod.title_km;

                        message += `${index}. [Ref: ${item.ref}] ${titleText}\n`;
                        message += `    Size: ${item.size} × ${item.qty} — $${itemTotal.toFixed(2)}\n`;
                        index++;
                    }

                    let grandTotal = subtotalPrice + deliveryFee;

                    message += `\n${t.tg_summary}\n`;
                    message += `${t.tg_subtotal}${subtotalPrice.toFixed(2)}\n`;
                    message += `${t.tg_delivery}${deliveryFeeText}\n`;
                    message += `${t.tg_grandtotal}${grandTotal.toFixed(2)}\n\n`;

                    cart = {};
                    renderCart();
                    updateAllCardStocks();
                    isOrderPlaced = true;

                    closeModal('checkoutModal');
                    closeModal('cartModal');

                    window.location.href = `https://t.me/${TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`;
                } else {
                    uiAlert(result.message || "មានបញ្ហាពេលកុម្មង់ទំនិញ!", 'error');
                }
            } catch (error) {
                console.error("Order error:", error);
                uiAlert("មិនអាចភ្ជាប់ទៅកាន់ Server លើ Railway បានទេ!", 'network');
            }
        }
