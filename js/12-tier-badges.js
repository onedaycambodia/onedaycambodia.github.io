        /* ===================== MEMBERSHIP TIERS (Bronze / Silver / Gold / Diamond / VIP) ===================== */
        const TIER_T = {
            km: { title:'កម្រិតសមាជិក', spent:'ចំណាយសរុប', new:'សមាជិកថ្មី', from:'ចាប់ពី', more:'ទិញទំនិញបន្ថែម $%1 ទៀតដើម្បីទទួលបានកម្រិត %2', top:'អ្នកបានដល់កម្រិតខ្ពស់បំផុតហើយ', you:'អ្នក' },
            en: { title:'Membership levels', spent:'Total spent', new:'New member', from:'From', more:'Spend $%1 more to reach %2', top:'You reached the top level', you:'You' },
            zh: { title:'会员等级', spent:'累计消费', new:'新会员', from:'满', more:'再消费 $%1 即可升级至 %2', top:'您已达到最高等级', you:'当前' }
        };
        const tt = (k) => (TIER_T[currentLang] || TIER_T.en)[k] || TIER_T.en[k];
        const TIER_NAME = { bronze:'Bronze', silver:'Silver', gold:'Gold', diamond:'Diamond', vip:'VIP' };
        const TIER_COLOR = { bronze:'#b8683a', silver:'#8b93a3', gold:'#c9971f', diamond:'#2f82c4', vip:'#6a42d8' };
        const TIER_GRAD = { bronze:['#b8683a','#ffc99a'], silver:['#6b7385','#c3cbd8'], gold:['#b9892b','#f6d36b'], diamond:['#2f82c4','#8fd8ff'], vip:['#7a4df0','#f0c24a'] };
        let tierData = null;
        // clothes-hanger logo used in the middle of every badge
        function tierIcon(c, cx, cy, s) {
            return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" fill="none" stroke="' + c + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M-2 -12a4.5 4.5 0 1 1 6.5 4c-2.2 1.3-2.5 2.4-2.5 4"/><path d="M2 -4 16 7q2 3.5-1.5 3.5h-25Q-14 10.5 -12 7Z"/><path d="M-17 -3h-7M-20 3h-7"/></g>';
        }
        function tierSvg(k) {
            const star = (x, y, r, c, d) => '<path class="tb-tw" style="animation-delay:' + d + 's" d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + c + '"/>';
            const P = {
                bronze:  { r1:'#f6bd8a', r2:'#733819', d1:'#eaa571', d2:'#b8683a', d3:'#8a4526', ico:'#5a290f', ico2:'#f8cfa6', rb1:'#b0602f', rb2:'#6a3217', hi:'#fff1e2', p1:'#e9a56f', p2:'#8a4526' },
                silver:  { r1:'#ffffff', r2:'#6b7487', d1:'#f3f5fa', d2:'#bcc4d1', d3:'#8a94a6', ico:'#384152', ico2:'#ffffff', rb1:'#6286ea', rb2:'#2a459c', hi:'#ffffff', p1:'#f4f6fb', p2:'#8a94a6' },
                gold:    { r1:'#fff1b0', r2:'#7a4d0e', d1:'#fff6d2', d2:'#f3c94f', d3:'#c9971f', ico:'#7a4d0e', ico2:'#fffbe6', rb1:'#e0525a', rb2:'#8f1f2a', hi:'#fffbe6', p1:'#ffe58a', p2:'#b9892b' },
                diamond: { r1:'#eefaff', r2:'#245f93', d1:'#f6fcff', d2:'#a4def8', d3:'#4aa3dc', ico:'#1f5f94', ico2:'#ffffff', rb1:'#4aa3dc', rb2:'#245f93', hi:'#ffffff', p1:'#c8edff', p2:'#3f86bf' },
                vip:     { r1:'#ffe9a0', r2:'#6a4a10', d1:'#8a63ff', d2:'#4b2fb5', d3:'#2c1a80', ico:'#f0c24a', ico2:'#1a0e55', rb1:'#8a63ff', rb2:'#3a2396', hi:'#fff3c4', p1:'#f7d36b', p2:'#b9892b' }
            }[k];
            const C = { bronze:{ n:8, l2:0, sp:0, rb:1, wing:0 }, silver:{ n:12, l2:0, sp:0, rb:1, wing:0 }, gold:{ n:12, l2:1, sp:1, rb:1, wing:0 }, diamond:{ n:12, l2:1, sp:2, rb:0, wing:0 }, vip:{ n:16, l2:1, sp:3, rb:0, wing:1 } }[k];
            const g = 'tg-' + k;
            // Khmer lotus petal pointing up from radius 17
            const petal = (a, len, w, fill) => '<path transform="translate(36 36) rotate(' + a.toFixed(1) + ')" d="M0 -17C' + w + ' -' + (17 + len * .3) + ' ' + w + ' -' + (17 + len * .72) + ' 0 -' + (17 + len) + 'C-' + w + ' -' + (17 + len * .72) + ' -' + w + ' -' + (17 + len * .3) + ' 0 -17Z" fill="' + fill + '" stroke="' + P.r2 + '" stroke-width=".7" stroke-opacity=".55"/>';
            // Angkor prang (stepped tower)
            const prang = (x, y, s) => '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M-8 0L-8 -3L-6.5 -3L-6.5 -6L-5 -6L-5 -9L-3.5 -9L-2 -13L0 -19L2 -13L3.5 -9L5 -9L5 -6L6.5 -6L6.5 -3L8 -3L8 0Z" fill="url(#' + g + '-p)" stroke="' + P.r2 + '" stroke-width="' + (.9 / s).toFixed(2) + '" stroke-linejoin="round"/>';
            // Kanok flame
            const flame = (a) => '<g transform="translate(36 36) rotate(' + a + ') translate(0 -27)"><path class="tb-flick" d="M0 0C3 -3 5 -8 1 -14C7 -10 10 -3 7 2C5 5 2 4 0 0Z" fill="url(#' + g + '-p)" stroke="' + P.r2 + '" stroke-width=".6"/></g>';
            let b = '<defs><linearGradient id="' + g + '-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + P.r1 + '"/><stop offset=".55" stop-color="' + P.d3 + '"/><stop offset="1" stop-color="' + P.r2 + '"/></linearGradient>' +
                '<radialGradient id="' + g + '-d" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="' + P.d1 + '"/><stop offset=".6" stop-color="' + P.d2 + '"/><stop offset="1" stop-color="' + P.d3 + '"/></radialGradient>' +
                '<linearGradient id="' + g + '-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.rb1 + '"/><stop offset="1" stop-color="' + P.rb2 + '"/></linearGradient>' +
                '<linearGradient id="' + g + '-p" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="' + P.p2 + '"/><stop offset="1" stop-color="' + P.p1 + '"/></linearGradient>' +
                '<linearGradient id="' + g + '-q" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="' + P.r2 + '"/><stop offset="1" stop-color="' + P.p2 + '"/></linearGradient>' +
                '<clipPath id="tc-' + k + '"><circle cx="36" cy="36" r="29"/></clipPath></defs>';
            if (C.rb) b += '<path class="tb-rib" d="M24 50 18 71 28 65 33 73 38 52Z" fill="url(#' + g + '-b)"/><path class="tb-rib" d="M24 50 28 65 33 73 38 52Z" fill="#000" opacity=".14"/>' +
                '<path class="tb-rib r2" d="M48 50 54 71 44 65 39 73 34 52Z" fill="url(#' + g + '-b)"/><path class="tb-rib r2" d="M48 50 44 65 39 73 34 52Z" fill="#000" opacity=".14"/>';
            if (C.wing) b += '<g>' + [-62, -88, -114, 62, 88, 114].map(flame).join('') + '</g>';
            if (C.l2) { let q = ''; for (let i = 0; i < C.n; i++) q += petal(i * 360 / C.n + 180 / C.n, 12.5, 5.2, 'url(#' + g + '-q)'); b += '<g class="tb-spin rev">' + q + '</g>'; }
            { let f = ''; const len = C.l2 ? 9.6 : 10.5, w = C.n === 8 ? 5.6 : 3.9; for (let i = 0; i < C.n; i++) f += petal(i * 360 / C.n, len, w, 'url(#' + g + '-p)'); b += '<g class="tb-spin">' + f + '</g>'; }
            b += '<circle cx="36" cy="36" r="19.6" fill="url(#' + g + '-r)"/><circle cx="36" cy="36" r="17.9" fill="none" stroke="' + P.r2 + '" stroke-width="1.5" stroke-dasharray="1.1 1.7" opacity=".5"/>' +
                '<circle cx="36" cy="36" r="15.6" fill="url(#' + g + '-d)" stroke="' + P.r2 + '" stroke-width="1"/><circle cx="36" cy="36" r="14.2" fill="none" stroke="' + P.hi + '" stroke-width=".7" opacity=".55"/>' +
                '<path class="tb-hi" d="M21.6 31A15 15 0 0 1 30 22" fill="none" stroke="' + P.hi + '" stroke-width="2.6" stroke-linecap="round"/>' +
                tierIcon(P.ico2, 36, 37.3, .5) + tierIcon(P.ico, 36, 36, .5);
            if (C.sp >= 2) b += prang(26.5, 14, C.sp === 3 ? .55 : .4) + prang(45.5, 14, C.sp === 3 ? .55 : .4);
            if (C.sp >= 1) b += prang(36, 11.5, C.sp === 3 ? .85 : (C.sp === 2 ? .7 : .55));
            if (C.sp === 3) b += '<circle class="tb-tw" cx="36" cy="-4.6" r="1.5" fill="#e5484d"/>';
            b += '<g clip-path="url(#tc-' + k + ')"><polygon class="tb-sweep" points="-30,0 -16,0 -26,80 -40,80" fill="#fff" opacity=".45"/></g>';
            if (k === 'diamond') b += star(68, 4, 6, '#5bb8f5', 0) + star(4, 12, 4, '#7ccaf8', .6) + star(66, 68, 4, '#7ccaf8', 1.2);
            return '<svg class="tb" viewBox="-4 -6 80 80" aria-hidden="true">' + b + '</svg>';
        }
        const tierFrom = (t) => t.from > 0 ? tt('from') + ' $' + t.from : tt('new');
