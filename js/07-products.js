        function showProductsError(reason) {
            let container = document.getElementById('productContainer');
            if (!container) return;
            let t = translations[currentLang];
            let why = reason ? `<div style="font-size:11px;opacity:.6;margin-top:6px;">(${esc(reason)})</div>` : '';
            container.innerHTML = `
                <div class="load-error-box">
                    <div>${ico('alert')} ${t.load_error}</div>${why}
                    <button onclick="retryLoadProducts()">${t.retry}</button>
                </div>`;
        }

        function showProductsSkeleton() {
            let container = document.getElementById('productContainer');
            if (!container) return;
            let sk = '<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>';
            container.innerHTML = sk + sk + sk + sk;
        }

        function retryLoadProducts() {
            showProductsSkeleton();
            loadDynamicProducts();
        }

        const PRODUCTS_CACHE_KEY = 'oneday_products_cache_v1';
        let productsAutoRetryTimer = null;
        let productsAutoRetryCount = 0;

        function saveProductsCache(list) {
            try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list)); } catch (e) {}
        }
        function readProductsCache() {
            try {
                let c = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || 'null');
                return Array.isArray(c) && c.length ? c : null;
            } catch (e) { return null; }
        }
        function scheduleProductsAutoRetry() {
            clearTimeout(productsAutoRetryTimer);
            if (productsAutoRetryCount >= 12) return; // stop after ~1 minute of trying
            productsAutoRetryCount++;
            productsAutoRetryTimer = setTimeout(loadDynamicProducts, 5000);
        }

        async function loadDynamicProducts() {
            clearTimeout(productsAutoRetryTimer);
            let data;
            // Step 1: fetch from the server
            try {
                let response = await fetchRetry(`${RAILWAY_API_URL}/api/products`);
                data = await response.json();
                if (!Array.isArray(data)) throw new Error('Bad data');
            } catch (error) {
                console.error("Error loading products (network/server):", error);
                let msg = String(error && error.message || error);
                let reason = /HTTP \d+/.test(msg) ? 'Server: ' + msg.match(/HTTP \d+/)[0]
                           : (msg === 'Bad data' ? 'Server: bad data' : 'Network');
                // Fall back to the last good product list so the shop is never empty
                let cached = readProductsCache();
                if (cached) {
                    productsList = cached;
                    try { renderProducts(); } catch (e) { console.error("Render (cache) error:", e); }
                } else {
                    showProductsError(reason);
                }
                scheduleProductsAutoRetry();
                return;
            }
            // Step 2: show them (a display bug is reported separately from a server problem)
            productsAutoRetryCount = 0;
            productsList = data;
            saveProductsCache(data);
            try {
                renderProducts();
            } catch (error) {
                console.error("Error rendering products:", error);
                showProductsError('Display error');
            }
        }

        async function backgroundSyncStock() {
            try {
                let response = await fetchRetry(`${RAILWAY_API_URL}/api/products`, 2);
                let freshProducts = await response.json();
                productsList = freshProducts;
                
                productsList.forEach(prod => {
                    let ref = prod.ref;
                    let sizes = (prod.sizes || []).filter(s => s && s.size);
                    sizes.forEach(s => {
                        let cleanRef = String(ref).trim().toUpperCase();
                        let cleanSize = String(s.size).trim().toUpperCase();
                        let key = `${cleanRef}_${cleanSize}`;
                        stockData[key] = s.stock_qty;
                        priceData[key] = parseFloat(prod.price) || 0;
                    });
                });

                updateAllCardStocks();
            } catch (error) {
                console.error("Background stock sync error:", error);
            }
        }

        function renderProducts() {
            let container = document.getElementById('productContainer');
            if (!container) return;

            stockData = {};
            priceData = {};

            const sizeOrder = { 'S': 1, 'M': 2, 'L': 3, 'XL': 4, 'XXL': 5 };

            let allHtml = '';

            productsList.forEach(prod => {
                let ref = prod.ref;
                let sizes = (prod.sizes || []).filter(s => s && s.size);

                sizes.sort((a, b) => {
                    let rankA = sizeOrder[a.size.toUpperCase()] || 99;
                    let rankB = sizeOrder[b.size.toUpperCase()] || 99;
                    return rankA - rankB;
                });

                sizes.forEach(s => {
                    let cleanRef = String(ref).trim().toUpperCase();
                    let cleanSize = String(s.size).trim().toUpperCase();
                    let key = `${cleanRef}_${cleanSize}`;
                    stockData[key] = s.stock_qty;
                    priceData[key] = parseFloat(prod.price) || 0;
                });

                let defaultSizeObj = sizes.find(s => s.size.toUpperCase() === 'M') || sizes[0];
                let defaultSizeName = defaultSizeObj ? defaultSizeObj.size.toUpperCase() : 'M';

                let sizeButtonsHtml = '';
                sizes.forEach((s) => {
                    let isActive = (s.size.toUpperCase() === defaultSizeName) ? 'active' : '';
                    sizeButtonsHtml += `<button class="size-btn ${isActive}" onclick="selectSize(this, ${jsq('prod-' + ref)}, ${jsq(ref)})">${esc(s.size)}</button>`;
                });

                let defaultKey = `${String(ref).trim().toUpperCase()}_${defaultSizeName}`;
                let totalStock = stockData[defaultKey] !== undefined ? stockData[defaultKey] : 0;
                let inCartQty = cart[defaultKey] ? cart[defaultKey].qty : 0;
                let defaultStock = Math.max(0, totalStock - inCartQty);

                let defaultStockText = defaultStock > 0 ? `${defaultStock}${translations[currentLang].in_stock}` : translations[currentLang].out_of_stock;
                let defaultStockColor = defaultStock > 0 ? "var(--accent)" : "#ef4444";

                let displayTitle = prod.title_km;

                if (currentLang === 'en') {
                    displayTitle = prod.title_en || prod.title_km;
                } else if (currentLang === 'zh') {
                    displayTitle = prod.title_zh || prod.title_km;
                }

                let mediaUrl = prod.video_url || '';
                let mediaHtml = '';
                let imgBoxClickAction = '';

                if (isImageUrl(mediaUrl)) {
                    imgBoxClickAction = `onclick="openProductVideoPopup(${jsq(mediaUrl)})"`;
                    mediaHtml = `<img src="${esc(optimizeMediaUrl(mediaUrl, false))}" alt="${esc(displayTitle)}" loading="lazy" decoding="async" style="width:100%; height:100%; object-fit:contain;">`;
                } else if (mediaUrl) {
                    imgBoxClickAction = `onclick="openProductVideoPopup(${jsq(mediaUrl)})"`;
                    mediaHtml = `
                        <video loop muted playsinline webkit-playsinline preload="metadata" controlslist="nodownload" disablepictureinpicture oncontextmenu="return false;">
                            <source src="${esc(optimizeMediaUrl(mediaUrl, true))}#t=0.1" type="video/mp4">
                        </video>`;
                }

                let btn3dHtml = '';
                if (prod.model_3d_url && prod.model_3d_url.trim() !== '') {
                    btn3dHtml = `
                        <button class="btn-3d-toggle" onclick="openProductVideoPopup(${jsq(prod.model_3d_url)}); event.stopPropagation();">
                            ${ico('video')} View 3D
                        </button>
                    `;
                }

                allHtml += `
                    <div class="card" id="prod-${esc(ref)}" data-gender="${esc(prod.gender || 'men')}" data-type="${esc(prod.type || 'tops')}">
                        <span class="badge">Ref: ${esc(ref)}</span>
                        <div class="img-box" ${imgBoxClickAction} style="position: relative;">
                            ${mediaHtml}
                            ${btn3dHtml}
                        </div>
                        <div>
                            <div class="prod-title">${esc(displayTitle)}</div>
                            <div class="price-box">
                                <img src="images/IMG_5837.png" alt="Price Icon" class="price-icon" loading="lazy">
                                <div class="price">$${parseFloat(prod.price).toFixed(2)}</div>
                            </div>
                        </div>
                        <div>
                            <div class="size-header"><div class="size-label">${translations[currentLang].select_size}</div></div>
                            <div class="size-grid">
                                ${sizeButtonsHtml}
                            </div>
                            <div class="stock-hint-box" id="stock-hint-prod-${esc(ref)}">
                                <span id="stock-text-prod-${esc(ref)}">${translations[currentLang].stock_remaining}</span>
                                <span style="color: ${defaultStockColor}; font-weight: 900;">${defaultStockText}</span>
                            </div>
                            <button class="btn-add" onclick="addToCart(this, ${Number(prod.price) || 0}, ${jsq('prod-' + ref)}, ${jsq(ref)}, event)">+ ${translations[currentLang].add_to_cart}</button>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = allHtml;

            setupVideoObserver();
            filterProducts();
        }

        async function fetchLiveStock(cardId, refText, selectedSize) {
            let stockBox = document.getElementById(`stock-hint-${cardId}`);
            let textSpan = document.getElementById(`stock-text-${cardId}`);
            let numSpan = stockBox ? stockBox.querySelector('span:last-child') : null;
            let card = document.getElementById(cardId);
            let priceDisplay = card ? card.querySelector('.price') : null;
            
            let cleanRef = String(refText).replace(/ref:?\s*/i, '').trim().toUpperCase();
            let cleanSize = String(selectedSize).trim().toUpperCase();
            let stockKey = `${cleanRef}_${cleanSize}`;

            let totalStock = stockData[stockKey] !== undefined ? stockData[stockKey] : 0;
            let currentPrice = priceData[stockKey] !== undefined ? priceData[stockKey] : 0;
            let inCartQty = cart[stockKey] ? cart[stockKey].qty : 0;

            let availableStock = Math.max(0, totalStock - inCartQty);

            if (priceDisplay && currentPrice > 0) {
                priceDisplay.innerText = `$${currentPrice.toFixed(2)}`;
            }

            if (stockBox && textSpan && numSpan) {
                textSpan.style.display = "inline";
                textSpan.innerText = translations[currentLang].stock_remaining;
                numSpan.innerText = availableStock > 0 ? `${availableStock}${translations[currentLang].in_stock}` : translations[currentLang].out_of_stock;
                numSpan.style.color = availableStock > 0 ? "var(--accent)" : "#ef4444";
            }
        }

        function updateAllCardStocks() {
            document.querySelectorAll('.card').forEach(card => {
                let cardId = card.id; 
                let refText = cardId.replace('prod-', '');
                let activeSizeBtn = card.querySelector('.size-btn.active');
                let selectedSize = activeSizeBtn ? activeSizeBtn.innerText : 'M';
                fetchLiveStock(cardId, refText, selectedSize);
            });
        }

        function selectSize(element, cardId, refText) {
            let buttons = element.parentElement.getElementsByClassName('size-btn');
            for (let btn of buttons) btn.classList.remove('active');
            element.classList.add('active');
            
            let selectedSize = element.innerText;
            fetchLiveStock(cardId, refText, selectedSize);
        }

        function selectMainCategory(gender, element) {
            currentGender = gender;
            currentType = 'all';
            currentPage = 1;

            document.querySelectorAll('.categories .cat-btn').forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            document.getElementById('sub-men').classList.remove('active');
            document.getElementById('sub-women').classList.remove('active');

            if (gender === 'men') {
                document.getElementById('sub-men').classList.add('active');
                resetSubActive('sub-men');
            } else if (gender === 'women') {
                document.getElementById('sub-women').classList.add('active');
                resetSubActive('sub-women');
            }

            filterProducts();
        }

        function selectSubCategory(gender, type, element) {
            currentGender = gender;
            currentType = type;
            currentPage = 1;

            let subContainer = element.parentElement;
            for (let btn of subContainer.getElementsByClassName('sub-btn')) btn.classList.remove('active');
            element.classList.add('active');

            filterProducts();
        }

        function resetSubActive(subId) {
            let buttons = document.getElementById(subId).getElementsByClassName('sub-btn');
            for (let btn of buttons) btn.classList.remove('active');
            buttons[0].classList.add('active');
        }

        function filterProducts() {
            let allCards = document.querySelectorAll('.container .card');
            let matchedCards = [];

            allCards.forEach(card => {
                let cardGender = card.getAttribute('data-gender');
                let cardType = card.getAttribute('data-type');

                if (cardGender === currentGender && (currentType === 'all' || cardType === currentType)) {
                    matchedCards.push(card);
                } else {
                    card.style.display = 'none';
                }
            });

            const perPage = getProductsPerPage();
            let totalPages = Math.ceil(matchedCards.length / perPage) || 1;
            if (currentPage > totalPages) currentPage = totalPages;

            let startIndex = (currentPage - 1) * perPage;
            let endIndex = startIndex + perPage;

            matchedCards.forEach((card, index) => {
                if (index >= startIndex && index < endIndex) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });

            renderPaginationControls(totalPages);
        }

        function renderPaginationControls(totalPages) {
            let paginationContainer = document.getElementById('paginationContainer');
            if (!paginationContainer) return;

            if (totalPages <= 1) {
                paginationContainer.innerHTML = '';
                return;
            }

            let html = '';
            for (let i = 1; i <= totalPages; i++) {
                let isActive = (i === currentPage) ? 'active' : '';
                html += `<button class="page-btn ${isActive}" onclick="changePage(${i})" style="padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border-color); background: ${i === currentPage ? 'var(--accent)' : 'var(--card-bg)'}; color: ${i === currentPage ? '#fff' : 'var(--primary)'}; font-weight: 800; cursor: pointer; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">${i}</button>`;
            }
            paginationContainer.innerHTML = html;
        }

        function changePage(page) {
            currentPage = page;
            filterProducts();
            window.scrollTo({ top: 350, behavior: 'smooth' });
        }

        document.addEventListener('DOMContentLoaded', function() {
            checkAutoTheme();
            loadUserInfo();

            loadWebsiteSettings();
            loadPaymentConfig();
            loadDynamicCovers();
            loadDynamicProducts();

            setInterval(backgroundSyncStock, 30000); 
            setInterval(loadWebsiteSettings, 60000);  
        });

        document.addEventListener("visibilitychange", function() {
            if (document.visibilityState === "visible") {
                if (productsList.length === 0) retryLoadProducts();
                else backgroundSyncStock();
                if (isOrderPlaced) {
                    closeModal('checkoutModal');
                    closeModal('cartModal');
                    closeModal('guideModal');
                    closeModal('mapPickerModal');
                    isOrderPlaced = false;
                }
            }
        });
