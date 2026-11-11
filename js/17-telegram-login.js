        // ---- Log in with Telegram (OpenID Connect, code + PKCE) ----
        const TG_PENDING = 'oneday_tg_pending';
        const tgRedirect = () => location.origin + location.pathname.replace(/index\.html$/, '');   // always the same address: https://site/
        const b64url = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
        let tgPopup = null, tgWatch = null;
        function tgBusy(on) { const b = document.getElementById('auTgBtn'); if (b) b.disabled = on; document.getElementById('auTgTxt').textContent = on ? at('tg_wait') : at('tg_btn'); }
        const TG_CART = 'oneday_tg_cart';
        let authMeta = null;   // what the customer was doing when we asked them to log in: {add:{ref,cardId}} | {order:true}
        function saveCartForRedirect() {
            try {
                const items = {};
                for (const k in cart) { const it = cart[k]; items[k] = { ref: it.ref, size: it.size, qty: it.qty, price: it.price }; }
                localStorage.setItem(TG_CART, JSON.stringify({ items, meta: authMeta, t: Date.now() }));
            } catch (e) {}
        }
        async function restoreCartAfterLogin() {
            let saved = null;
            try { saved = JSON.parse(localStorage.getItem(TG_CART) || 'null'); localStorage.removeItem(TG_CART); } catch (e) {}
            if (!saved || Date.now() - saved.t > 30 * 60 * 1000) return;
            for (let n = 0; n < 40 && !(productsList.length && Object.keys(stockData).length); n++) await new Promise(r => setTimeout(r, 300));
            const put = (ref, size, qty, price) => {
                const prod = productsList.find(p => String(p.ref).trim().toUpperCase() === String(ref).trim().toUpperCase());
                if (!prod) return;
                const key = String(ref).trim().toUpperCase() + '_' + String(size).trim().toUpperCase();
                const have = cart[key] ? cart[key].qty : 0, max = stockData[key] !== undefined ? stockData[key] : 0;
                const q = Math.min(qty, max - have); if (q <= 0) return;
                const pr = priceData[key] && priceData[key] > 0 ? priceData[key] : price;
                if (cart[key]) cart[key].qty += q; else cart[key] = { product: prod, price: pr, size, ref, qty: q };
            };
            for (const k in (saved.items || {})) { const it = saved.items[k]; put(it.ref, it.size, it.qty, it.price); }
            const m = saved.meta || {};
            if (m.add) put(m.add.ref, m.add.size || 'M', 1, 0);
            renderCart();
            if (m.add) showToast(translations[currentLang].toast_added);
            if (m.order) setTimeout(() => prepareOrder(), 300);
        }
