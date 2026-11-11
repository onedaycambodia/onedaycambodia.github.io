        // ===== UI motion helpers =====
        (function () {
            // pop animation on selection buttons
            document.addEventListener('click', function (e) {
                let el = e.target.closest('.cat-btn, .sub-btn, .size-btn, .page-btn');
                if (!el) return;
                el.classList.remove('pop');
                void el.offsetWidth;
                el.classList.add('pop');
                el.addEventListener('animationend', function h() { el.classList.remove('pop'); el.removeEventListener('animationend', h); });
            });
            // total price ticks whenever it changes
            let tp = document.getElementById('total-price');
            if (tp && window.MutationObserver) {
                new MutationObserver(function () {
                    tp.classList.remove('tick');
                    void tp.offsetWidth;
                    tp.classList.add('tick');
                }).observe(tp, { childList: true, characterData: true, subtree: true });
            }
        })();

        // ===== Checkout form helpers =====
        function syncMapField(justSet) {
            let f = document.getElementById('mapField'), i = document.getElementById('custMapUrl');
            if (!f || !i) return;
            f.classList.toggle('has-loc', i.value.trim() !== '');
            if (justSet) { f.classList.remove('loc-set'); void f.offsetWidth; f.classList.add('loc-set'); setTimeout(() => f.classList.remove('loc-set'), 1000); }
        }
        function clearMapLoc(e) {
            if (e) { e.stopPropagation(); e.preventDefault(); }
            let i = document.getElementById('custMapUrl');
            if (i) i.value = '';
            syncMapField();
        }
        function shakeErrors() {
            let bad = document.querySelectorAll('#checkoutModal .form-input.error');
            bad.forEach(function (inp) {
                let f = inp.closest('.field');
                if (f) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); setTimeout(() => f.classList.remove('shake'), 500); }
            });
            if (bad[0]) { bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); bad[0].focus({ preventScroll: true }); }
        }
        // refresh the map field when the checkout opens
        (function () {
            const _open = openModal;
            openModal = function (id) { _open.apply(this, arguments); if (id === 'checkoutModal') syncMapField(); };
            // order button shows a spinner while the order is being sent and ignores double taps
            const _order = openTelegram;
            openTelegram = async function () {
                const b = document.getElementById('btnOrderNow');
                if (b && b.classList.contains('busy')) return;
                if (b) b.classList.add('busy');
                try { return await _order.apply(this, arguments); }
                finally { if (b) b.classList.remove('busy'); }
            };
        })();

        // ===== App dialog: nicer replacement for alert() =====
        var UI_DLG_TEXT = {
            stock:    { km: '\u179f\u17d2\u178f\u17bb\u1780\u1798\u17b7\u1793\u1782\u17d2\u179a\u1794\u17cb\u1782\u17d2\u179a\u17b6\u1793\u17cb', en: 'Not enough stock', zh: '\u5e93\u5b58\u4e0d\u8db3' },
            error:    { km: '\u1798\u17b6\u1793\u1794\u1789\u17d2\u17a0\u17b6', en: 'Something went wrong', zh: '\u51fa\u9519\u4e86' },
            network:  { km: '\u1798\u17b7\u1793\u17a2\u17b6\u1785\u1797\u17d2\u1787\u17b6\u1794\u17cb\u1794\u17b6\u1793', en: 'Connection problem', zh: '\u8fde\u63a5\u5931\u8d25' },
            cart:     { km: '\u1780\u1793\u17d2\u178f\u17d2\u179a\u1780\u1791\u1791\u17c1', en: 'Your cart is empty', zh: '\u8d2d\u7269\u8f66\u662f\u7a7a\u7684' },
            location: { km: '\u1791\u17b8\u178f\u17b6\u17c6\u1784\u1798\u17b7\u1793\u17a2\u17b6\u1785\u1794\u17d2\u179a\u17be\u1794\u17b6\u1793', en: 'Location unavailable', zh: '\u65e0\u6cd5\u4f7f\u7528\u8be5\u4f4d\u7f6e' },
            info:     { km: '\u1787\u17bc\u1793\u178a\u17c6\u178e\u17b9\u1784', en: 'Notice', zh: '\u63d0\u793a' }
        };
        var UI_DLG_OK = { km: '\u1799\u179b\u17cb\u1796\u17d2\u179a\u1798', en: 'OK', zh: '\u597d\u7684' };
        var UI_DLG_ICON = {
            stock:    '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
            error:    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.01"/>',
            network:  '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5v.01"/><path d="M4 4l16 16"/>',
            cart:     '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
            location: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
            info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.5v.01"/>'
        };
        var _dlgQueue = [], _dlgOpen = false, _dlgEl = null, _dlgLast = '';

        function _dlgLang() { try { return (typeof currentLang !== 'undefined' && UI_DLG_OK[currentLang]) ? currentLang : 'km'; } catch (e) { return 'km'; } }
        function _dlgBuild() {
            if (_dlgEl) return _dlgEl;
            _dlgEl = document.createElement('div');
            _dlgEl.className = 'ui-dialog';
            _dlgEl.setAttribute('aria-hidden', 'true');
            _dlgEl.innerHTML = '<div class="ui-dialog-card" role="alertdialog" aria-modal="true">' +
                '<div class="ui-dialog-icon"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></div>' +
                '<div class="ui-dialog-title"></div><div class="ui-dialog-msg"></div>' +
                '<button type="button" class="ui-dialog-btn"></button></div>';
            document.body.appendChild(_dlgEl);
            _dlgEl.addEventListener('click', function (e) { if (e.target === _dlgEl) uiDialogClose(); });
            _dlgEl.querySelector('.ui-dialog-btn').addEventListener('click', uiDialogClose);
            document.addEventListener('keydown', function (e) { if (_dlgOpen && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); uiDialogClose(); } });
            return _dlgEl;
        }
        function _dlgNext() {
            if (_dlgOpen || !_dlgQueue.length) return;
            var item = _dlgQueue.shift(), el = _dlgBuild(), lang = _dlgLang(), type = UI_DLG_ICON[item.type] ? item.type : 'info';
            el.className = 'ui-dialog t-' + type;
            el.querySelector('.ui-dialog-icon svg').innerHTML = UI_DLG_ICON[type];
            el.querySelector('.ui-dialog-title').textContent = UI_DLG_TEXT[type][lang];
            el.querySelector('.ui-dialog-msg').textContent = item.message;
            el.querySelector('.ui-dialog-btn').textContent = UI_DLG_OK[lang];
            _dlgOpen = true;
            el.setAttribute('aria-hidden', 'false');
            void el.offsetWidth;
            el.classList.add('open');
            if (navigator.vibrate && (type === 'error' || type === 'stock' || type === 'network')) { try { navigator.vibrate([18, 40, 18]); } catch (e) {} }
            setTimeout(function () { var b = el.querySelector('.ui-dialog-btn'); if (b) b.focus({ preventScroll: true }); }, 60);
        }
        function uiDialogClose() {
            if (!_dlgOpen || !_dlgEl) return;
            _dlgEl.classList.remove('open');
            _dlgEl.setAttribute('aria-hidden', 'true');
            setTimeout(function () { _dlgOpen = false; _dlgLast = ''; _dlgNext(); }, 320);
        }
        function uiAlert(message, type) {
            var msg = String(message == null ? '' : message);
            if (!msg || msg === _dlgLast) return;   // ignore the same popup fired twice in a row
            _dlgLast = msg;
            _dlgQueue.push({ message: msg, type: type || 'info' });
            _dlgNext();
        }
        window.alert = function (m) { uiAlert(m, 'info'); };   // safety net for any alert() left anywhere

        // ===== Confirm dialog (Yes / No) =====
        var UI_CFM = {
            order:  { icon: '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="m9.5 14 2 2 3.5-3.5"/>',
                      title: { km: '\u1794\u1789\u17d2\u1787\u17b6\u1780\u17cb\u1780\u17b6\u179a\u1780\u17bb\u1798\u17d2\u1798\u1784\u17cb?', en: 'Confirm your order?', zh: '\u786e\u8ba4\u4e0b\u5355\uff1f' },
                      yes:   { km: '\u1794\u1789\u17d2\u1787\u17b6\u1780\u17cb', en: 'Yes, order', zh: '\u662f\u7684\uff0c\u4e0b\u5355' } },
            logout: { icon: '<path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
                      title: { km: '\u1785\u17b6\u1780\u1785\u17c1\u1789\u1796\u17b8\u1782\u178e\u1793\u17b8?', en: 'Log out?', zh: '\u9000\u51fa\u767b\u5f55\uff1f' },
                      yes:   { km: '\u1785\u17b6\u1780\u1785\u17c1\u1789', en: 'Log out', zh: '\u9000\u51fa' } }
        };
        var UI_CFM_NO = { km: '\u1794\u17c4\u17c7\u1794\u1784\u17cb', en: 'Cancel', zh: '\u53d6\u6d88' };
        var _cfmEl = null, _cfmResolve = null;
        function _cfmBuild() {
            if (_cfmEl) return _cfmEl;
            _cfmEl = document.createElement('div');
            _cfmEl.className = 'ui-dialog';
            _cfmEl.setAttribute('aria-hidden', 'true');
            _cfmEl.innerHTML = '<div class="ui-dialog-card" role="alertdialog" aria-modal="true">' +
                '<div class="ui-dialog-icon"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></div>' +
                '<div class="ui-dialog-title"></div><div class="ui-dialog-msg"></div>' +
                '<div class="ui-dialog-actions"><button type="button" class="ui-dialog-btn ghost" data-r="0"></button>' +
                '<button type="button" class="ui-dialog-btn" data-r="1"></button></div></div>';
            document.body.appendChild(_cfmEl);
            _cfmEl.addEventListener('click', function (e) {
                if (e.target === _cfmEl) return _cfmDone(false);
                var b = e.target.closest && e.target.closest('.ui-dialog-btn');
                if (b) _cfmDone(b.getAttribute('data-r') === '1');
            });
            document.addEventListener('keydown', function (e) { if (_cfmResolve && e.key === 'Escape') { e.preventDefault(); _cfmDone(false); } });
            return _cfmEl;
        }
        function _cfmDone(v) {
            if (!_cfmResolve) return;
            var r = _cfmResolve; _cfmResolve = null;
            _cfmEl.classList.remove('open');
            _cfmEl.setAttribute('aria-hidden', 'true');
            r(v);
        }
        function uiConfirm(kind, message) {
            return new Promise(function (resolve) {
                if (_cfmResolve) return resolve(false);
                var c = UI_CFM[kind] || UI_CFM.order, el = _cfmBuild(), lang = _dlgLang();
                el.className = 'ui-dialog t-' + kind;
                el.querySelector('.ui-dialog-icon svg').innerHTML = c.icon;
                el.querySelector('.ui-dialog-title').textContent = c.title[lang];
                el.querySelector('.ui-dialog-msg').textContent = message || '';
                el.querySelector('.ui-dialog-msg').style.display = message ? '' : 'none';
                el.querySelector('[data-r="0"]').textContent = UI_CFM_NO[lang];
                el.querySelector('[data-r="1"]').textContent = c.yes[lang];
                _cfmResolve = resolve;
                el.setAttribute('aria-hidden', 'false');
                void el.offsetWidth;
                el.classList.add('open');
                setTimeout(function () { var b = el.querySelector('[data-r="1"]'); if (b) b.focus({ preventScroll: true }); }, 60);
            });
        }
        var UI_CFM_MSG = {
            order:  { km: '\u178f\u17be\u17a2\u17d2\u1793\u1780\u1794\u17d2\u179a\u17b6\u1780\u178a\u1790\u17b6\u1785\u1784\u17cb\u1780\u17bb\u1798\u17d2\u1798\u1784\u17cb\u1798\u17c2\u1793\u1791\u17c1? \u179f\u179a\u17bb\u1794', en: 'Are you sure you want to place this order? Total', zh: '\u786e\u5b9a\u8981\u4e0b\u5355\u5417\uff1f\u5408\u8ba1' },
            logout: { km: '\u17a2\u17d2\u1793\u1780\u1793\u17b9\u1784\u178f\u17d2\u179a\u17bc\u179c\u1785\u17bc\u179b\u1782\u178e\u1793\u17b8\u1798\u17d2\u178f\u1784\u1791\u17c0\u178f\u178a\u17be\u1798\u17d2\u1794\u17b8\u1794\u17d2\u179a\u17be\u17d4', en: 'You will need to sign in again to use your account.', zh: '\u60a8\u9700\u8981\u91cd\u65b0\u767b\u5f55\u624d\u80fd\u4f7f\u7528\u8d26\u6237\u3002' }
        };
