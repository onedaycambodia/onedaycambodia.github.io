        async function fetchRetry(url, tries = 4, timeoutMs = 10000) {
            let lastErr;
            for (let i = 0; i < tries; i++) {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), timeoutMs);
                try {
                    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
                    clearTimeout(timer);
                    if (r.ok) return r;
                    lastErr = new Error('HTTP ' + r.status);
                } catch (e) {
                    clearTimeout(timer);
                    lastErr = e;
                }
                await new Promise(res => setTimeout(res, 800 * (i + 1)));
            }
            throw lastErr || new Error('Failed: ' + url);
        }

        function optimizeMediaUrl(url, isVideo) {
            if (!url || typeof url !== 'string') return url;
            if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
            const parts = url.split('/upload/');
            if (/^(f_|q_|w_|c_|vc_)/.test(parts[1])) return url;
            const transform = isVideo ? 'q_auto' : 'f_auto,q_auto';
            return parts[0] + '/upload/' + transform + '/' + parts[1];
        }

        function isImageUrl(url) {
            if (!url) return false;
            let cleanUrl = url.toLowerCase().split('?')[0];
            return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.webp');
        }

        async function loadDynamicCovers() {
            try {
                let response = await fetchRetry(`${RAILWAY_API_URL}/api/website-covers`);
                let covers = await response.json();
                let slider = document.getElementById('coverSlider');
                let dotsContainer = document.getElementById('coverDots');
                
                if (covers.length > 0 && slider && dotsContainer) {
                    let sliderHtml = '';
                    let dotsHtml = '';

                    covers.forEach((cov, idx) => {
                        let isActiveDot = idx === 0 ? 'active' : '';
                        dotsHtml += `<div class="cover-dot ${isActiveDot}"></div>`;

                        if (isImageUrl(cov.cover_url)) {
                            let imgUrl = optimizeMediaUrl(cov.cover_url, false);
                            sliderHtml += `
                                <div class="cover-slide-item">
                                    <div class="cover-image-box">
                                        <img src="${esc(imgUrl)}" alt="Cover ${idx + 1}" ${idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} onload="fitCoverSlide(this)" style="width:100%; height:100%; object-fit:cover; display:block;">
                                    </div>
                                </div>`;
                        } else {
                            let vidUrl = optimizeMediaUrl(cov.cover_url, true);
                            sliderHtml += `
                                <div class="cover-slide-item">
                                    <div class="cover-image-box">
                                        <video autoplay loop muted playsinline webkit-playsinline preload="${idx === 0 ? 'auto' : 'metadata'}" onloadedmetadata="fitCoverSlide(this)" style="width:100%; height:100%; object-fit:cover; display:block;">
                                            <source src="${esc(vidUrl)}" type="video/mp4">
                                        </video>
                                    </div>
                                </div>`;
                        }
                    });

                    slider.innerHTML = sliderHtml;
                    dotsContainer.innerHTML = dotsHtml;
                    startAutoSlide();
                }
            } catch (err) {
                console.error("Error loading dynamic covers:", err);
            }
        }

        function startAutoSlide() {
            if (slideInterval) clearInterval(slideInterval);
            slideInterval = setInterval(() => {
                const slider = document.getElementById('coverSlider');
                if (!slider) return;
                let slideWidth = slider.clientWidth;
                let maxScrollLeft = slider.scrollWidth - slider.clientWidth;
                
                if (slider.scrollLeft + slideWidth >= maxScrollLeft - 10) {
                    slider.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    slider.scrollBy({ left: slideWidth, behavior: 'smooth' });
                }
            }, SLIDE_DELAY);
        }

        async function loadWebsiteSettings() {
            try {
                let response = await fetchRetry(`${RAILWAY_API_URL}/api/website-settings`, 2);
                let settings = await response.json();

                if (settings.cart_icon_url) {
                    let cartIcons = document.querySelectorAll('.dynamic-cart-icon');
                    cartIcons.forEach(icon => {
                        icon.src = settings.cart_icon_url;
                    });
                }

                if (settings.delivery_fee !== undefined) {
                    let val = String(settings.delivery_fee).trim();
                    let parsedNum = parseFloat(val);
                    if (!isNaN(parsedNum)) {
                        deliveryFee = parsedNum;
                        deliveryFeeText = `$${parsedNum.toFixed(2)}`;
                    } else {
                        deliveryFee = 0;
                        deliveryFeeText = val; 
                    }
                    renderCart();
                }
            } catch (error) {
                console.error("Error loading website settings:", error);
            }
        }

        let videoObserver = null;
        function setupVideoObserver() {
            if (videoObserver) videoObserver.disconnect();
            videoObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target;
                    if (entry.isIntersecting) {
                        video.play().catch(() => {});
                    } else {
                        video.pause();
                    }
                });
            }, { threshold: 0.25 });

            document.querySelectorAll('.card video').forEach(video => videoObserver.observe(video));
        }
