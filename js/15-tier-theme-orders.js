        const KH_PAIR = { bronze:['lion', 'lion'], silver:['naga', 'naga'], gold:['garuda', 'garuda'], diamond:['hanuman', 'hanuman'], vip:['naga', 'garuda'] };
        const KH_BG = { bronze:['lion'], silver:['naga'], gold:['garuda'], diamond:['hanuman'], vip:['lion', 'naga', 'garuda', 'hanuman'] };
        function tierTheme(k) {
            const box = document.querySelector('#acctModal .modal-content');
            if (!box) return;
            if (k) box.setAttribute('data-tier', k); else box.removeAttribute('data-tier');
            box.querySelectorAll('.kh-orn').forEach(n => n.remove());
            if (!k) return;
            const top = document.createElement('div'); top.className = 'kh-top kh-orn'; top.setAttribute('aria-hidden', 'true'); box.insertBefore(top, box.firstChild);
            const bgs = KH_BG[k], bg = document.createElement('div'); bg.className = 'kh-bg kh-orn'; bg.setAttribute('aria-hidden', 'true');
            const KH_IMG = { diamond: 'naga', vip: 'hanuman' };
            if (KH_IMG[k]) bg.innerHTML = '<div class="kh-bgimg ' + KH_IMG[k] + '"></div>'; else
            bg.innerHTML = bgs.length === 1 ? khSvg(bgs[0], 'kh-bgart') :
                '<svg class="kh-bgart" viewBox="0 0 200 200">' + bgs.map((n, i) => khSvg(n, '').replace('<svg class="" ', '<svg x="' + (i % 2) * 100 + '" y="' + Math.floor(i / 2) * 100 + '" width="100" height="100" ')).join('') + '</svg>';
            /* background art removed for all ranks (1-5) */
            const hero = box.querySelector('.au-hero');
            if (hero) {
                const leaf = (a) => '<path transform="rotate(' + a + ')" d="M0 0C5 3.5 13 3.5 22 0C13 -3.5 5 -3.5 0 0Z"/>';
                const corner = (pos) => '<svg class="kh-orn kh-c ' + pos + '" viewBox="0 0 30 30" aria-hidden="true"><g transform="translate(3 3)" fill="currentColor">' + leaf(8) + leaf(40) + leaf(72) + '<circle r="2.3"/><path d="M13 1A12 12 0 0 1 1 13" fill="none" stroke="currentColor" stroke-width="1"/></g></svg>';
                const pr = KH_PAIR[k];
                if (k === 'diamond') hero.insertAdjacentHTML('afterbegin', '<div class="kh-orn hero-naga" aria-hidden="true"></div>');
                if (k === 'vip') hero.insertAdjacentHTML('afterbegin', '<div class="kh-orn vip-art" aria-hidden="true">' + VIP_HERO_SVG + '</div>');
                hero.insertAdjacentHTML('beforeend', khSvg(pr[0], 'kh-orn kh-pet l') + khSvg(pr[1], 'kh-orn kh-pet r') + '<div class="kh-orn kh-band" aria-hidden="true"></div>');
                if (k === 'diamond') {
                    const kc = (pos) => '<svg class="kh-orn kh-k ' + pos + '" viewBox="0 0 48 48" aria-hidden="true">' +
                        '<path class="kc-line" pathLength="100" d="M3 40V12Q3 3 12 3H40"/>' +
                        '<path class="kc-line kc-in" pathLength="100" d="M9 31V15Q9 9 15 9H31"/>' +
                        '<g class="kc-flame"><path d="M13 13C13 22 19 28 29 28C24 25 22 21 24 16C20 18 16 17 13 13Z"/>' +
                        '<path d="M13 13C22 13 28 19 28 29C25 24 21 22 16 24C18 20 17 16 13 13Z"/></g>' +
                        '<path class="kc-tip" d="M30 6C34 6 37 8 38 12C35 10 33 10 30 11C31 9 31 8 30 6Z"/>' +
                        '<path class="kc-tip" d="M6 30C6 34 8 37 12 38C10 35 10 33 11 30C9 31 8 31 6 30Z"/>' +
                        '<circle class="kc-gem" cx="13" cy="13" r="2.6"/></svg>';
                    hero.insertAdjacentHTML('beforeend', kc('tl') + kc('tr') + kc('bl') + kc('br'));
                }
            }
        }
        function tierRender() {
            const d = tierData, card = document.getElementById('tierCard'), chip = document.getElementById('acTierChip');
            if (!d || !card) return;
            const cur = d.tiers.find(t => t.key === d.tier);
            tierTheme(d.tier);
            if (chip) { const g = TIER_GRAD[d.tier]; chip.innerHTML = tierSvg(d.tier); chip.classList.add('on'); }
            /* tier box removed for all ranks */
            card.style.display = 'none'; card.innerHTML = '';
            return;
            if (!d.next) {
                // top rank: no progress line, a clean gold/purple card (SVG only)
                const sp = (dl) => '<svg class="tspark" viewBox="0 0 24 24" aria-hidden="true"><path class="tb-tw" style="animation-delay:' + dl + 's" d="M12 1Q12 12 23 12Q12 12 12 23Q12 12 1 12Q12 12 12 1Z" fill="#f0c24a"/></svg>';
                card.className = 'tier-card max';
                card.innerHTML = tierSvg(d.tier) +
                    '<div class="tmax-mid"><div class="tmax-name">' + sp(0) + '<b>' + TIER_NAME[d.tier] + '</b>' + sp(.7) + '</div><div class="tmax-sub">' + esc(tt('top')) + '</div></div>' +
                    '<div class="tmax-spent"><small>' + esc(tt('spent')) + '</small><b>$' + Number(d.spent).toFixed(2) + '</b></div>';
                card.style.display = '';
                return;
            }
            card.className = 'tier-card';
            let pct = 100, sub = '';
            {
                const need = Math.max(0, d.next_at - d.spent);
                pct = Math.max(5, Math.min(100, ((d.spent - cur.from) / (d.next_at - cur.from)) * 100));
                sub = tt('more').replace('%1', need.toFixed(2).replace(/\.00$/, '')).replace('%2', TIER_NAME[d.next]);
            }
            const bd = (k, cls) => '<div class="tier-bd' + cls + '">' + tierSvg(k) + '<small style="color:' + TIER_COLOR[k] + '">' + TIER_NAME[k] + '</small></div>';
            card.innerHTML = bd(d.tier, '') +
                '<div class="tier-mid"><div class="tier-line"><i style="width:' + pct.toFixed(0) + '%"></i></div><div class="tier-sub">' + esc(sub) + '</div></div>' +
                bd(d.next, ' nxt');
            card.style.display = '';
        }
        async function tierLoad() {
            // preview any style without spending: add ?tierpreview=bronze|silver|gold|diamond|vip to the URL
            const pv = new URLSearchParams(location.search).get('tierpreview');
            if (pv && TIER_NAME[pv]) {
                const T = [['bronze', 0], ['silver', 20], ['gold', 50], ['diamond', 100], ['vip', 300]], i = T.findIndex(t => t[0] === pv), n = T[i + 1];
                tierData = { ok: true, spent: T[i][1] + 5, tier: pv, next: n ? n[0] : null, next_at: n ? n[1] : null, tiers: T.map(t => ({ key: t[0], from: t[1] })) };
                tierRender(); return;
            }
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/my/tier`, { headers: authHeaders(), cache: 'no-store' });
                if (!r.ok) { tierData = null; tierTheme(null); return; }
                const j = await r.json();
                if (j && j.ok) { tierData = j; tierRender(); }
            } catch (e) { /* tier is optional - hide silently */ }
        }
        function openTiers() {
            if (!tierData) return;
            document.getElementById('tierModalTitle').textContent = tt('title');
            document.getElementById('tierList').innerHTML = tierData.tiers.map(t =>
                '<div class="tier-row' + (t.key === tierData.tier ? ' me' : '') + '">' + tierSvg(t.key) +
                '<div><b>' + TIER_NAME[t.key] + '</b><span>' + esc(tierFrom(t)) + '</span></div>' +
                (t.key === 'diamond' ? '<div class="tier-art naga" aria-hidden="true"></div>' : '') +
                (t.key === tierData.tier ? '<span class="you">' + esc(tt('you')) + '</span>' : '') + '</div>').join('');
            openModal('tierModal');
        }

        async function openOrders() {
            applyAuthLang();
            const body = document.getElementById('ordersBody');
            body.innerHTML = `<div class="od-empty"><svg class="ico" aria-hidden="true"><use href="#i-spinner"/></svg>${esc(at('loading'))}</div>`;
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/my/orders`, { headers: authHeaders(), cache: 'no-store' });
                if (r.status === 401) { clearAuth(); closeModal('acctModal'); return openAuth(); }
                const j = await r.json();
                const list = j.orders || [];
                if (!list.length) { body.innerHTML = `<div class="od-empty"><svg class="ico" aria-hidden="true"><use href="#i-box"/></svg>${esc(at('no_orders'))}</div>`; return; }
                const loc = currentLang === 'km' ? 'km-KH' : currentLang === 'zh' ? 'zh-CN' : 'en-GB';
                body.innerHTML = list.map(o => {
                    const stIcon = o.status === 'CONFIRMED' ? 'check' : (o.status === 'CANCELLED' || o.status === 'EXPIRED') ? 'ban' : 'hourglass';
                    const stCls = (o.status === 'CANCELLED' || o.status === 'EXPIRED') ? 'bad' : o.status === 'CONFIRMED' ? 'paid' : '';
                    const pay = { paid: ['paid', 'check', 'pay_paid'], unpaid: ['unpaid', 'hourglass', 'pay_unpaid'], cod: ['', 'truck', 'pay_cod'], cancelled: ['bad', 'ban', 'pay_none'], expired: ['bad', 'ban', 'pay_none'], refunded: ['paid', 'refresh', 'pay_refunded'] }[(o.status === 'CANCELLED' && String(o.method).toUpperCase() === 'WALLET') ? 'refunded' : o.pay] || ['', 'dot', 'pay_cod'];
                    const amount = (o.pay_amount != null ? o.pay_amount : o.total);
                    return `<div class="od-card">
                        <div class="od-top"><div><div class="od-id">${esc(at('order'))}${Number(o.id)}</div><div class="od-date">${esc(new Date(o.created_at).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' }))}</div></div>
                        <div class="od-chips">${odChip(pay[0], pay[1], at(pay[2]))}${odChip(stCls, stIcon, at('st_' + o.status))}</div></div>
                        ${(o.items || []).map(i => `<div class="od-item"><span>[${esc(i.ref)}] ${esc(i.title)} · ${esc(i.size)} × ${Number(i.qty)}</span><span>$${(Number(i.price) * Number(i.qty)).toFixed(2)}</span></div>`).join('')}
                        <div class="od-total"><span>${esc(at('total'))}</span><span>$${Number(amount).toFixed(2)}</span></div></div>`;
                }).join('');
            } catch (e) { body.innerHTML = `<div class="od-empty"><svg class="ico" aria-hidden="true"><use href="#i-alert"/></svg>${esc(at('err_net'))}</div>`; }
        }
