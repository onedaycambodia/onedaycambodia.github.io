        /* ---- edit own profile: name + photo ---- */
        const AC_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>', AC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        async function acSaveProfile(body) {
            try {
                const r = await fetch(`${RAILWAY_API_URL}/api/my/profile`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify(body) });
                if (r.status === 401) { clearAuth(); closeModal('acctModal'); openAuth(); return false; }
                const j = await r.json().catch(() => ({}));
                if (j.ok) { authCust = j.customer; updateAcctUi(); return true; }
            } catch (e) {}
            showToast(at('err_save')); return false;
        }
        function acRenderName() {
            const row = document.getElementById('acNameRow'); row.dataset.edit = '';
            row.innerHTML = '<b id="acName"></b><button class="au-pen" type="button" onclick="acEditName()" aria-label="Edit name">' + AC_PEN + '</button>';
            updateAcctUi();
        }
        function acEditName() {
            const row = document.getElementById('acNameRow'); if (!authCust || row.dataset.edit) return;
            row.dataset.edit = '1';
            row.innerHTML = '<input id="acNameIn" class="au-nameIn" type="text" maxlength="100" autocomplete="name"><button class="au-pen ok" type="button" onclick="acSaveName()" aria-label="Save">' + AC_CHECK + '</button>';
            const i = document.getElementById('acNameIn'); i.value = authCust.name || ''; i.focus(); i.select();
            i.addEventListener('keydown', (e) => { if (e.key === 'Enter') acSaveName(); else if (e.key === 'Escape') acRenderName(); });
        }
        async function acSaveName() {
            const i = document.getElementById('acNameIn'); if (!i) return;
            const v = i.value.trim();
            if (!v || v === (authCust.name || '')) return acRenderName();
            if (await acSaveProfile({ name: v })) {
                try { localStorage.setItem('oneday_cust_name', authCust.name || ''); } catch (e) {}
                const cn = document.getElementById('custName'); if (cn) cn.value = authCust.name || '';   // checkout form uses the new name
                acRenderName(); showToast(at('saved'));
            }
        }
        function acPickPhoto(inp) {
            const f = inp.files && inp.files[0]; inp.value = '';
            if (!f || !/^image\//.test(f.type)) return;
            const url = URL.createObjectURL(f), img = new Image();
            img.onload = async () => {
                const S = 192, c = document.createElement('canvas'); c.width = c.height = S;
                const m = Math.min(img.width, img.height);
                c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
                URL.revokeObjectURL(url);
                if (await acSaveProfile({ avatar: c.toDataURL('image/jpeg', 0.82) })) showToast(at('saved'));
            };
            img.onerror = () => { URL.revokeObjectURL(url); showToast(at('err_save')); };
            img.src = url;
        }
