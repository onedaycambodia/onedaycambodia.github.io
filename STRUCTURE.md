# Project structure (index.html split into small files)

index.html is now only the page markup (~40 KB). Styles and scripts live in folders so an AI (or you)
can open, search and edit just the part that matters.

## css/  (loaded in this order from index.html - order matters, later rules override earlier ones)
01-base, 02-header-cover, 03-products-cart, 04-modals-media, 05-khqr-motion, 06-checkout-dialog,
07-account-wallet, 08-tier-themes (bronze..vip), 09-khmer-ornaments, 10-vip-hero, 11-account-ui

## js/  (plain scripts, loaded in this order - they share one global scope, same as before)
01-config-state      API url, global state, helpers (esc, jsq)
02-icons-translations icons + km/en/zh text
03-media-covers      cover slider, website settings
04-theme-language    dark mode, language switch
05-cover-modals-toast modal open/close, toast, prepareOrder
06-map-picker        Leaflet map + GPS
07-products          product list, stock, categories, pagination
08-cart              add to cart, cart render
09-khqr-payment-order KHQR / Bakong payment + sending the order
10-ui-helpers-dialogs checkout helpers, alert/confirm dialogs
11-account-auth      login / account / orders UI
12-tier-badges       membership medal SVG (tierSvg)
13-khmer-art         Khmer line-art (lion, naga, garuda, hanuman)
14-vip-hero-art      VIP hero background SVG
15-tier-theme-orders tierTheme / tierRender / openOrders
16-wallet            wallet + pay with wallet
17-telegram-login, 18-profile-edit, 19-google-tiktok-login

## images/  now also holds khmer-naga.png, khmer-hanuman.png, login-tiktok.png, login-telegram.png
(they used to be 300 KB of base64 inside index.html).

Rule: to add a new script/stylesheet, add a <script src> / <link> line in index.html at the right position.
