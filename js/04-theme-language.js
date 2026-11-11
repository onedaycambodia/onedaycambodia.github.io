        function checkAutoTheme() {
            let options = { timeZone: 'Asia/Phnom_Penh', hour: 'numeric', hour12: false };
            let cambodiaHour = parseInt(new Intl.DateTimeFormat([], options).format(new Date()));
            
            if (cambodiaHour >= 19 || cambodiaHour < 6) {
                setTheme(true);
            } else {
                setTheme(false);
            }
        }

        function setTheme(isDark) {
            let img = document.getElementById('themeImg');
            if (isDark) {
                document.body.classList.add('dark-mode');
                if (img) img.src = 'images/IMG_5829.png'; 
            } else {
                document.body.classList.remove('dark-mode');
                if (img) img.src = 'images/IMG_5830.png'; 
            }
        }

        function toggleTheme() {
            let isDark = document.body.classList.contains('dark-mode');
            setTheme(!isDark);
        }

        function changeLanguage(lang) {
            currentLang = lang;
            
            let flagImg = document.getElementById('langFlagImg');
            if (flagImg && langFlags[lang]) {
                flagImg.src = langFlags[lang];
            }

            const elements = document.querySelectorAll('[data-key]');
            elements.forEach(el => {
                const key = el.getAttribute('data-key');
                if (translations[lang] && translations[lang][key]) {
                    if (translations[lang][key].includes('{{')) { el.innerHTML = iconize(translations[lang][key]); } else { el.innerText = translations[lang][key]; }
                }
            });

            const placeholders = document.querySelectorAll('[data-placeholder-key]');
            placeholders.forEach(el => {
                const key = el.getAttribute('data-placeholder-key');
                if (translations[lang] && translations[lang][key]) {
                    el.placeholder = translations[lang][key];
                }
            });

            if (productsList.length > 0) renderProducts();
            renderCart();
        }
