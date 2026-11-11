        // Smart cover: size each slide to the uploaded media's own aspect ratio (no cropping).
        // Extreme ratios are clamped so the banner never becomes too tall or too thin.
        const COVER_MIN_AR = 1.0, COVER_MAX_AR = 3.2;
        function fitCoverSlide(el) {
            const w = el.naturalWidth || el.videoWidth, h = el.naturalHeight || el.videoHeight;
            if (!w || !h) return;
            const ar = Math.min(COVER_MAX_AR, Math.max(COVER_MIN_AR, w / h));
            const box = el.closest('.cover-image-box');
            if (box) box.style.setProperty('--cover-ar', ar.toFixed(4));
            fitCoverHeight();
        }
        function fitCoverHeight() {
            const slider = document.getElementById('coverSlider');
            if (!slider || !slider.clientWidth) return;
            const idx = Math.round(slider.scrollLeft / slider.clientWidth);
            const slide = slider.children[idx];
            if (slide) slider.style.height = slide.offsetHeight + 'px';
        }
        window.addEventListener('resize', fitCoverHeight);

        function updateCoverDots() {
            const slider = document.getElementById('coverSlider');
            const dots = document.getElementById('coverDots').children;
            if (!slider || !dots || dots.length === 0) return;
            const scrollLeft = slider.scrollLeft;
            const slideWidth = slider.clientWidth;
            const currentIndex = Math.round(scrollLeft / slideWidth);
            fitCoverHeight();
            
            for (let i = 0; i < dots.length; i++) {
                if (i === currentIndex) {
                    dots[i].classList.add('active');
                } else {
                    dots[i].classList.remove('active');
                }
            }
        }

        function openModal(modalId) {
            if (modalId === 'checkoutModal' || modalId === 'walletModal') setViewportLock(true); // no zoom while filling in a form
            document.getElementById(modalId).classList.add('active');
        }
        function closeModal(modalId) {
            if (modalId === 'checkoutModal') setViewportLock(false);
            else if (modalId === 'walletModal') { const co = document.getElementById('checkoutModal'); if (!(co && co.classList.contains('active'))) setViewportLock(false); } // stay locked if checkout is still open underneath
            setTimeout(resetZoom, 60); 
            let modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('active');
                if (modalId === 'videoPopupModal') {
                    let videoPlayer = document.getElementById('popupVideoPlayer');
                    let imagePlayer = document.getElementById('popupImagePlayer');
                    if (videoPlayer) {
                        videoPlayer.pause();
                        videoPlayer.removeAttribute('src');
                        videoPlayer.load();
                        videoPlayer.style.display = 'none';
                    }
                    if (imagePlayer) {
                        imagePlayer.removeAttribute('src');
                        imagePlayer.style.display = 'none';
                    }
                }
            }
        }
        function handleModalClick(event, modalId) { if (event.target.id === modalId) closeModal(modalId); }

        function openProductVideoPopup(mediaUrl) {
            let modal = document.getElementById('videoPopupModal');
            let videoPlayer = document.getElementById('popupVideoPlayer');
            let imagePlayer = document.getElementById('popupImagePlayer');
            
            if (!mediaUrl || !/^https:\/\//i.test(mediaUrl)) return;

            if (isImageUrl(mediaUrl)) {
                if (videoPlayer) {
                    videoPlayer.pause();
                    videoPlayer.style.display = 'none';
                }
                if (imagePlayer) {
                    imagePlayer.src = optimizeMediaUrl(mediaUrl, false);
                    imagePlayer.style.display = 'block';
                }
            } else {
                if (imagePlayer) {
                    imagePlayer.style.display = 'none';
                }
                if (videoPlayer) {
                    videoPlayer.style.display = 'block';
                    videoPlayer.muted = false;
                    videoPlayer.src = optimizeMediaUrl(mediaUrl, true);
                    videoPlayer.load();
                    videoPlayer.play().catch(err => {
                        console.log("Auto-play with sound blocked, trying muted:", err);
                        videoPlayer.muted = true;
                        videoPlayer.play();
                    });
                }
            }
            
            if (modal) {
                modal.classList.add('active');
            }
        }

        function toggleCartModal() { 
            let modal = document.getElementById('cartModal');
            if (modal.classList.contains('active')) closeModal('cartModal');
            else openModal('cartModal');
        }

        function toggleGuideModal() {
            let modal = document.getElementById('guideModal');
            if (modal.classList.contains('active')) closeModal('guideModal');
            else openModal('guideModal');
        }

        function showToast(msg) {
            const toast = document.getElementById('toastNotification');
            const toastMsg = document.getElementById('toastMessage');
            if (toast && toastMsg) {
                toastMsg.innerText = msg;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            }
        }

        async function prepareOrder() {
            if (Object.keys(cart).length === 0) {
                uiAlert(translations[currentLang].empty_cart, 'cart');
                return;
            }
            await backgroundSyncStock();
            closeModal('cartModal');
            openModal('checkoutModal');
            loadUserInfo();
        }
