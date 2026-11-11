        // ===== Map picker motion helpers =====
        function pinIconHtml() {
            return '<div class="pin-wrap"><div class="pin-ring"></div><div class="pin-shadow"></div><div class="pin-body">' +
                   '<svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 0C7.2 0 0 7 0 15.7 0 27 16 42 16 42s16-15 16-26.3C32 7 24.8 0 16 0z"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg></div></div>';
        }
        function pinWrap() { return freeMarker && freeMarker._icon ? freeMarker._icon.querySelector('.pin-wrap') : null; }
        function dropPin() {
            let w = pinWrap(); if (!w) return;
            w.classList.remove('drop'); void w.offsetWidth; w.classList.add('drop');
        }
        function updateMapChip(pos) {
            let chip = document.getElementById('mapChip'), txt = document.getElementById('mapChipText');
            if (!chip || !txt) return;
            txt.textContent = pos.lat.toFixed(5) + ', ' + pos.lng.toFixed(5);
            chip.classList.remove('tick'); void chip.offsetWidth; chip.classList.add('tick');
        }
        function mapRipple(latlng) {
            if (!freeMapObj) return;
            let pt = freeMapObj.latLngToContainerPoint(latlng);
            let r = document.createElement('div');
            r.className = 'map-ripple';
            r.style.left = pt.x + 'px'; r.style.top = pt.y + 'px';
            freeMapObj.getContainer().appendChild(r);
            setTimeout(() => r.remove(), 700);
        }
        function glideMarkerTo(latlng) {
            let el = freeMarker && freeMarker._icon;
            if (el) { el.classList.add('pin-glide'); setTimeout(() => el.classList.remove('pin-glide'), 450); }
            freeMarker.setLatLng(latlng);
        }

        // iOS Safari zooms the page when an input is focused and never zooms back by itself.
        // Briefly locking the viewport scale forces it back to normal (the user can still pinch-zoom afterwards).
        const VIEWPORT_NORMAL = 'width=device-width, initial-scale=1.0';
        const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
        let viewportLocked = false;
        function setViewportLock(on) {
            const m = document.querySelector('meta[name="viewport"]');
            if (!m) return;
            viewportLocked = on;
            m.setAttribute('content', on ? VIEWPORT_LOCKED : VIEWPORT_NORMAL);
        }
        function resetZoom() {
            if (viewportLocked) return; // already locked (checkout form open)
            const m = document.querySelector('meta[name="viewport"]');
            if (!m) return;
            m.setAttribute('content', VIEWPORT_LOCKED);
            setTimeout(() => { if (!viewportLocked) m.setAttribute('content', VIEWPORT_NORMAL); }, 350);
        }
        document.addEventListener('focusout', () => setTimeout(resetZoom, 60));

        function openMapModal() {
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            resetZoom();
            openModal('mapPickerModal');
            setTimeout(() => {
                let bounds = getCambodiaBounds();
                if (!window.L || !bounds) {
                    uiAlert("Map កំពុង load សូមរង់ចាំបន្តិច រួចព្យាយាមម្តងទៀត។", 'info');
                    return;
                }
                if (!freeMapObj) {
                    freeMapObj = L.map('freeMap', { 
                        zoomControl: false,
                        maxBounds: bounds,
                        maxBoundsViscosity: 1.0
                    }).setView([currentPos.lat, currentPos.lng], 13);
                    
                    // HERE Maps raster tiles (key restricted to our domain in HERE platform)
                    const HERE_API_KEY = 'jKSBkCzNf2pzmEDQD_4775QIe-Y8PgjvlHohp66pV4s';
                    const tiles = L.tileLayer('https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=explore.night&size=512&apiKey=' + HERE_API_KEY, {
                        maxZoom: 19, minZoom: 7,
                        tileSize: 512, zoomOffset: -1,
                        attribution: '&copy; HERE'
                    }).addTo(freeMapObj);
                    const revealMap = () => { let w = document.getElementById('mapWrap'); if (w) w.classList.add('map-ready'); };
                    tiles.once('load', revealMap);
                    setTimeout(revealMap, 4000); // never leave the skeleton forever, even on a slow network

                    freeMapObj.attributionControl.setPrefix(false); // លាក់ពាក្យ Leaflet (រក្សា © HERE)
                    L.control.zoom({ position: 'topleft' }).addTo(freeMapObj);
                    const hereIcon = L.divIcon({
                        className: '',
                        html: pinIconHtml(),
                        iconSize: [36, 46], iconAnchor: [18, 46]
                    });
                    freeMarker = L.marker([currentPos.lat, currentPos.lng], { draggable: true, icon: hereIcon }).addTo(freeMapObj);

                    freeMapObj.on('click', function(e) {
                        if (bounds.contains(e.latlng)) {
                            currentPos = { lat: e.latlng.lat, lng: e.latlng.lng };
                            mapRipple(e.latlng);
                            glideMarkerTo(e.latlng);
                            dropPin();
                            updateMapChip(currentPos);
                        }
                    });

                    freeMarker.on('dragstart', function() {
                        let w = pinWrap(); if (w) { w.classList.remove('drop'); w.classList.add('lift'); }
                    });
                    freeMarker.on('drag', function() {
                        let p = freeMarker.getLatLng();
                        updateMapChip({ lat: p.lat, lng: p.lng });
                    });
                    freeMarker.on('dragend', function() {
                        let w = pinWrap(); if (w) w.classList.remove('lift');
                        let position = freeMarker.getLatLng();
                        if (bounds.contains(position)) {
                            currentPos = { lat: position.lat, lng: position.lng };
                            mapRipple(position);
                        } else {
                            glideMarkerTo([currentPos.lat, currentPos.lng]);
                        }
                        dropPin();
                        updateMapChip(currentPos);
                    });

                    updateMapChip(currentPos);
                    dropPin();
                    locateUserGPS();
                } else {
                    freeMapObj.invalidateSize();
                    updateMapChip(currentPos);
                    dropPin();
                }
                // the modal is still springing open at this point, so measure the map once more when it settles
                setTimeout(() => { if (freeMapObj) freeMapObj.invalidateSize(); }, 650);
                let cb = document.getElementById('btnConfirmLoc');
                if (cb && cb.dataset.orig) { cb.innerHTML = cb.dataset.orig; delete cb.dataset.orig; cb.classList.remove('ok'); }
            }, 300);
        }

        let gpsCircle = null;
        function locateUserGPS() {
            let bounds = getCambodiaBounds();
            let btn = document.getElementById('btnLocate');
            if (navigator.geolocation && bounds) {
                if (btn) { btn.classList.remove('found'); btn.classList.add('locating'); }
                navigator.geolocation.getCurrentPosition((position) => {
                    let lat = position.coords.latitude;
                    let lng = position.coords.longitude;
                    let targetLatLng = L.latLng(lat, lng);
                    if (btn) btn.classList.remove('locating');

                    if (bounds.contains(targetLatLng)) {
                        currentPos = { lat, lng };
                        if (freeMapObj && freeMarker) {
                            freeMarker.setLatLng([lat, lng]);
                            freeMapObj.flyTo([lat, lng], 16, { duration: 1.1 });
                            setTimeout(() => { dropPin(); mapRipple(targetLatLng); }, 900);
                            updateMapChip(currentPos);
                            if (gpsCircle) { freeMapObj.removeLayer(gpsCircle); gpsCircle = null; }
                            let acc = Math.min(position.coords.accuracy || 0, 500);
                            if (acc > 0) gpsCircle = L.circle([lat, lng], { radius: acc, className: 'gps-accuracy', color: '#0284c7', weight: 1, fillColor: '#0284c7', fillOpacity: 0.14, interactive: false }).addTo(freeMapObj);
                        }
                        if (btn) { btn.classList.add('found'); setTimeout(() => btn.classList.remove('found'), 1600); }
                    } else {
                        uiAlert("\u1791\u17b8\u178f\u17b6\u17c6\u1784\u1794\u1785\u17d2\u1785\u17bb\u1794\u17d2\u1794\u1793\u17d2\u1793\u179a\u1794\u179f\u17cb\u17a2\u17d2\u1793\u1780\u1793\u17c5\u1780\u17d2\u179a\u17c5\u1794\u17d2\u179a\u1791\u17c1\u179f\u1780\u1798\u17d2\u1796\u17bb\u1787\u17b6!", 'location');
                    }
                }, () => { if (btn) btn.classList.remove('locating'); }, { enableHighAccuracy: true, timeout: 15000 });
            }
        }

        function confirmFreeLocation() {
            let coordsText = `${currentPos.lat.toFixed(6)}, ${currentPos.lng.toFixed(6)}`;
            let input = document.getElementById('custMapUrl');
            input.value = coordsText;
            syncMapField(true);
            let cb = document.getElementById('btnConfirmLoc');
            if (cb && !cb.classList.contains('ok')) {
                cb.dataset.orig = cb.innerHTML;
                cb.innerHTML = ico('check') + cb.innerText.trim();
                cb.classList.add('ok');
            }
            setTimeout(() => {
                closeModal('mapPickerModal');
                input.classList.remove('flash-ok'); void input.offsetWidth; input.classList.add('flash-ok');
                setTimeout(() => input.classList.remove('flash-ok'), 1000);
            }, 550);
        }
