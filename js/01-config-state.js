        const TELEGRAM_USERNAME = "OneDayClothingAgent";
        let deliveryFee = 2.00;
        let deliveryFeeText = "$2.00";
        
        // GitHub Pages API Endpoint Connected to Railway
        const RAILWAY_API_URL = "https://onedaycambodiagithubio-production.up.railway.app";

        // 🔒 Anything that comes from the database / admins is escaped before it goes into innerHTML (stored-XSS fix).
        // esc() = text or attribute value; jsq() = a JS string literal that is safe inside onclick="..."
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        function jsq(v) { return esc(JSON.stringify(String(v == null ? '' : v))); }

        let stockData = {};
        let priceData = {};
        let productsList = [];
        let currentLang = 'km';
        let cart = {};
        let currentGender = 'men';
        let currentType = 'all';

        let isOrderPlaced = false;

        let currentPage = 1;
        // few products at a time so the customer doesn't have to scroll a lot: phone 2 columns x 2 rows, PC 4 columns x 2 rows
        const getProductsPerPage = () => (window.innerWidth >= 768 ? 8 : 4);

        let freeMapObj = null;
        let freeMarker = null;
        let currentPos = { lat: 11.5564, lng: 104.9282 };

        let slideInterval = null;
        const SLIDE_DELAY = 4000;

        let cambodiaBounds = null;
        function getCambodiaBounds() {
            if (!cambodiaBounds && window.L) {
                cambodiaBounds = L.latLngBounds([10.3807, 102.3323], [14.6905, 107.6284]);
            }
            return cambodiaBounds;
        }

        const langFlags = {
            km: 'images/IMG_5833.png',
            en: 'images/IMG_5835.png',
            zh: 'images/IMG_5834.png'
        };
