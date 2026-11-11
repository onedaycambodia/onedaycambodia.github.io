        function playFlyAnimation(event, cardId) {
            let card = document.getElementById(cardId);
            let imgBox = card ? card.querySelector('.img-box video, .img-box img') : null;
            let cartBtn = document.querySelector('.btn-cart-view');
            if (!imgBox || !cartBtn) return;

            let isVideo = imgBox.tagName.toLowerCase() === 'video';
            let flyer = document.createElement(isVideo ? 'video' : 'img');
            flyer.src = imgBox.currentSrc || imgBox.src;
            flyer.className = 'fly-item';
            flyer.style.transition = 'none';

            let rect = imgBox.getBoundingClientRect();
            let cartRect = cartBtn.getBoundingClientRect();
            let startX = rect.left + rect.width / 2 - 30;
            let startY = rect.top + rect.height / 2 - 30;
            flyer.style.left = startX + 'px';
            flyer.style.top = startY + 'px';
            document.body.appendChild(flyer);

            let dx = (cartRect.left + cartRect.width / 2 - 30) - startX;
            let dy = (cartRect.top + cartRect.height / 2 - 30) - startY;

            const done = () => {
                flyer.remove();
                cartBtn.classList.remove('bump');
                void cartBtn.offsetWidth;
                cartBtn.classList.add('bump');
                setTimeout(() => cartBtn.classList.remove('bump'), 500);
            };

            if (!flyer.animate) { setTimeout(done, 700); return; }
            // curved path: lifts up first, then dives into the cart
            let anim = flyer.animate([
                { transform: 'translate(0,0) scale(1.15) rotate(0deg)', opacity: 1, offset: 0 },
                { transform: `translate(${dx * 0.45}px, ${Math.min(dy * 0.2, 0) - 70}px) scale(.8) rotate(100deg)`, opacity: 1, offset: 0.4 },
                { transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(260deg)`, opacity: .35, offset: 1 }
            ], { duration: 750, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
            anim.onfinish = done;
        }

        async function addToCart(buttonEl, defaultPrice, cardId, refText, event) {
            let productObj = productsList.find(p => String(p.ref).trim().toUpperCase() === String(refText).trim().toUpperCase());
            if (!productObj) return;

            let activeSizeBtn = document.querySelector(`#${cardId} .size-btn.active`);
            let selectedSize = activeSizeBtn ? activeSizeBtn.innerText : 'M';
            let cleanRef = String(refText).trim().toUpperCase();
            let cleanSize = selectedSize.trim().toUpperCase();
            let stockKey = `${cleanRef}_${cleanSize}`;

            let totalStock = stockData[stockKey] !== undefined ? stockData[stockKey] : 0;
            let currentQtyInCart = cart[stockKey] ? cart[stockKey].qty : 0;

            if (totalStock === 0 || (currentQtyInCart + 1) > totalStock) {
                uiAlert(translations[currentLang].alert_stock_exceeded(refText, selectedSize, totalStock), 'stock');
                return;
            }

            playFlyAnimation(event, cardId);

            let activePrice = priceData[stockKey] && priceData[stockKey] > 0 ? priceData[stockKey] : defaultPrice;

            if (cart[stockKey]) {
                cart[stockKey].qty += 1;
                cart[stockKey].price = activePrice;
            } else {
                cart[stockKey] = {
                    product: productObj,
                    price: activePrice,
                    size: selectedSize,
                    ref: refText,
                    qty: 1
                };
            }

            fetchLiveStock(cardId, refText, selectedSize);

            renderCart();
            showToast(translations[currentLang].toast_added);

            if (buttonEl && !buttonEl.classList.contains('added')) {
                let original = buttonEl.innerHTML;
                buttonEl.innerHTML = ico('check') + translations[currentLang].toast_added.replace(/!$/, '');
                buttonEl.classList.add('added');
                setTimeout(() => { buttonEl.innerHTML = original; buttonEl.classList.remove('added'); }, 1100);
            }
        }

        function changeQty(itemKey, delta) {
            if (cart[itemKey]) {
                let newQty = cart[itemKey].qty + delta;
                let availableStock = stockData[itemKey] !== undefined ? stockData[itemKey] : 0;

                if (delta > 0 && newQty > availableStock) {
                    let parts = itemKey.split('_');
                    let refVal = parts[0];
                    let sizeVal = parts[1];
                    uiAlert(translations[currentLang].alert_stock_exceeded(refVal, sizeVal, availableStock), 'stock');
                    return;
                }

                cart[itemKey].qty = newQty;
                if (cart[itemKey].qty <= 0) delete cart[itemKey];
            }
            renderCart();
            updateAllCardStocks();
        }

        function deleteCartItem(itemKey) {
            if (cart[itemKey]) {
                delete cart[itemKey];
                renderCart();
                updateAllCardStocks();
            }
        }

        function clearError(inputElement) { inputElement.classList.remove('error'); }

        function saveUserInfo() {
            try {
                localStorage.setItem('oneday_cust_name', document.getElementById('custName').value.trim());
                localStorage.setItem('oneday_cust_phone', document.getElementById('custPhone').value.trim());
                localStorage.setItem('oneday_cust_address', document.getElementById('custAddress').value.trim());
            } catch (e) {}
        }

        function loadUserInfo() {
            try {
                let name = localStorage.getItem('oneday_cust_name');
                let phone = localStorage.getItem('oneday_cust_phone');
                let address = localStorage.getItem('oneday_cust_address');

                if (name) document.getElementById('custName').value = name;
                if (phone) document.getElementById('custPhone').value = phone;
                if (address) document.getElementById('custAddress').value = address;
            } catch (e) {}
        }

        function renderCart() {
            let cartList = document.getElementById('cart-list');
            let modalFooter = document.getElementById('modal-footer');
            let summaryBox = document.getElementById('summary-box');
            let deliveryFeeDisplay = document.getElementById('delivery-fee-display');
            let totalItems = 0;
            let subtotalPrice = 0;
            let itemsHtml = '';

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
                totalItems += item.qty;
                subtotalPrice += itemTotal;

                let prod = item.product;
                let displayTitle = prod.title_km;
                if (currentLang === 'en') {
                    displayTitle = prod.title_en || prod.title_km;
                } else if (currentLang === 'zh') {
                    displayTitle = prod.title_zh || prod.title_km;
                }

                itemsHtml += `
                    <div class="cart-item">
                        <div>
                            <div class="item-info">[Ref: ${esc(item.ref)}] ${esc(displayTitle)}</div>
                            <div class="item-sub">Size: ${esc(item.size)} | $${item.price.toFixed(2)}</div>
                        </div>
                        <div class="qty-controls">
                            <button class="btn-qty" onclick="changeQty(${jsq(key)}, -1)">-</button>
                            <span style="font-weight:800; font-size:13px;">${item.qty}</span>
                            <button class="btn-qty" onclick="changeQty(${jsq(key)}, 1)">+</button>
                            <button class="btn-delete-item" onclick="deleteCartItem(${jsq(key)})" title="Delete"><svg class="ico ico-trash" aria-hidden="true"><use href="#i-trash"/></svg></button>
                        </div>
                    </div>
                `;
            }

            if (Object.keys(cart).length === 0) {
                cartList.innerHTML = `<div class="empty-msg" data-key="empty_cart">${translations[currentLang].empty_cart}</div>`;
                modalFooter.style.display = 'none';
                summaryBox.style.display = 'none';
            } else {
                cartList.innerHTML = itemsHtml;
                modalFooter.style.display = 'flex';
                summaryBox.style.display = 'flex';
            }

            if (deliveryFeeDisplay) {
                deliveryFeeDisplay.innerText = deliveryFeeText;
            }

            let grandTotal = subtotalPrice > 0 ? subtotalPrice + deliveryFee : 0;

            let cartCountEl = document.getElementById('cart-count');
            if (cartCountEl) cartCountEl.innerText = totalItems;
            
            document.getElementById('items-count').innerText = totalItems;
            document.getElementById('subtotal-amount').innerText = '$' + subtotalPrice.toFixed(2);
            document.getElementById('total-price').innerText = '$' + grandTotal.toFixed(2);
            document.getElementById('modal-total-price').innerText = '$' + grandTotal.toFixed(2);
            document.getElementById('checkout-total-price').innerText = '$' + grandTotal.toFixed(2);
        }
