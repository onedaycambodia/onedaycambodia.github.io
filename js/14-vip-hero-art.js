        /* VIP hero artwork (gold frame, Angkor night scene, Khmer corners) */
        const VIP_HERO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 40 1200 400" preserveAspectRatio="none" aria-hidden="true" fill="none">
  <defs>
    <linearGradient id="vh-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="400">
      <stop offset="0" stop-color="#fbeab0"/>
      <stop offset="0.22" stop-color="#d9b44a"/>
      <stop offset="0.48" stop-color="#8f6b1f"/>
      <stop offset="0.74" stop-color="#e8c768"/>
      <stop offset="1" stop-color="#a47b25"/>
    </linearGradient>
    <linearGradient id="vh-goldSoft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6e2a0"/>
      <stop offset="1" stop-color="#b8902b"/>
    </linearGradient>
    <linearGradient id="vh-bevelLight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="vh-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a1030"/>
      <stop offset="0.5" stop-color="#1a1250"/>
      <stop offset="1" stop-color="#2d1670"/>
    </linearGradient>
    <radialGradient id="vh-moon" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#9b6bff" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#9b6bff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vh-temple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a6dff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#2a1a78" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="vh-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="vh-blur10" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="vh-blur4" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <filter id="vh-blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <clipPath id="vh-frameClip"><rect width="1200" height="400" rx="36"/></clipPath>

    <path id="vh-star" d="M0 -6 Q0.7 -0.7 6 0 Q0.7 0.7 0 6 Q-0.7 0.7 -6 0 Q-0.7 -0.7 0 -6Z"/>

    <!-- Khmer-inspired corner ornament (top-left) -->
    <g id="vh-corner" stroke="url(#vh-gold)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M26 104 V58 Q26 26 58 26 H104"/>
      <path d="M38 88 V60 Q38 38 60 38 H88" opacity="0.55" stroke-width="0.9"/>
      <!-- lotus / kbach motif at the corner -->
      <path d="M46 46 L56 34 L66 46 L56 58 Z" fill="#d9b44a" fill-opacity="0.18"/>
      <path d="M56 40 L61 46 L56 52 L51 46 Z" fill="#f6e2a0" fill-opacity="0.55" stroke="none"/>
      <!-- flame scrolls along each edge -->
      <path d="M104 26 C122 26 130 36 122 44 C116 49 108 45 110 39 C111 35 117 35 118 39"/>
      <path d="M26 104 C26 122 36 130 44 122 C49 116 45 108 39 110 C35 111 35 117 39 118"/>
      <path d="M78 26 Q84 14 92 22 Q86 26 78 26" opacity="0.8"/>
      <path d="M26 78 Q14 84 22 92 Q26 86 26 78" opacity="0.8"/>
      <path d="M70 38 Q78 46 70 54" opacity="0.5" stroke-width="0.8"/>
      <path d="M38 70 Q46 78 54 70" opacity="0.5" stroke-width="0.8"/>
      <circle cx="136" cy="26" r="1.8" fill="#f6e2a0" stroke="none"/>
      <circle cx="26" cy="136" r="1.8" fill="#f6e2a0" stroke="none"/>
      <circle cx="22" cy="22" r="2.4" fill="#fbeab0" stroke="none"/>
    </g>

    <!-- Angkor towers -->
    <path id="vh-towerMain" d="M556 380 V352 H568 V324 H578 V298 H587 V272 Q600 238 600 208 Q600 238 613 272 V298 H622 V324 H632 V352 H644 V380 Z"/>
    <path id="vh-towerSide" d="M496 380 V344 H506 V320 H513 V302 Q524 268 535 302 V320 H542 V344 H552 V380 Z"/>
    <path id="vh-towerOuter" d="M430 380 V356 H438 V338 H444 V324 Q452 300 460 324 V338 H466 V356 H474 V380 Z"/>
  </defs>

  <g transform="translate(40 40)">
    <!-- Soft purple neon glow -->
    <rect width="1200" height="400" rx="36" stroke="#7c3aed" stroke-width="10" opacity="0.55" filter="url(#vh-blur10)"/>
    <rect width="1200" height="400" rx="36" stroke="#a78bfa" stroke-width="3" opacity="0.75" filter="url(#vh-blur4)"/>

    <!-- Background -->
    <rect width="1200" height="400" rx="36" fill="url(#vh-bg)"/>

    <g clip-path="url(#vh-frameClip)">
      <ellipse cx="600" cy="320" rx="330" ry="170" fill="url(#vh-moon)"/>

      <!-- Angkor silhouette (kept low and faint so the center stays clean) -->
      <g transform="translate(600 400) scale(0.82) translate(-600 -400)" fill="url(#vh-temple)">
        <rect x="360" y="368" width="480" height="32"/>
        <rect x="380" y="356" width="440" height="16"/>
        <use href="#vh-towerMain"/>
        <use href="#vh-towerSide"/>
        <use href="#vh-towerSide" transform="translate(1200 0) scale(-1 1)"/>
        <use href="#vh-towerOuter"/>
        <use href="#vh-towerOuter" transform="translate(1200 0) scale(-1 1)"/>
        <rect x="598.5" y="190" width="3" height="20"/>
      </g>

      <!-- Inner edge purple glow -->
      <rect x="-6" y="-6" width="1212" height="412" rx="40" stroke="#7c3aed" stroke-width="26" opacity="0.38" filter="url(#vh-blur10)"/>

      <!-- Glossy top sheen -->
      <rect width="1200" height="400" rx="36" fill="url(#vh-sheen)"/>
    </g>

    <!-- Metallic gold borders with bevel -->
    <rect x="1" y="1" width="1198" height="398" rx="35" stroke="url(#vh-gold)" stroke-width="2.4"/>
    <rect x="1" y="1" width="1198" height="398" rx="35" stroke="url(#vh-bevelLight)" stroke-width="2.4" opacity="0.55"/>
    <rect x="12" y="12" width="1176" height="376" rx="26" stroke="url(#vh-gold)" stroke-width="0.9" opacity="0.7"/>

    <!-- Corner ornaments -->
    <use href="#vh-corner"/>
    <use href="#vh-corner" transform="translate(1200 0) scale(-1 1)"/>
    <use href="#vh-corner" transform="translate(0 400) scale(1 -1)"/>
    <use href="#vh-corner" transform="translate(1200 400) scale(-1 -1)"/>

    <!-- Tiny center-edge accents -->
    <g fill="url(#vh-goldSoft)">
      <path d="M600 6 L607 12 L600 18 L593 12 Z"/>
      <path d="M600 382 L607 388 L600 394 L593 388 Z"/>
    </g>
    <g fill="#f6e2a0" opacity="0.8">
      <circle cx="578" cy="12" r="1.4"/><circle cx="622" cy="12" r="1.4"/>
      <circle cx="578" cy="388" r="1.4"/><circle cx="622" cy="388" r="1.4"/>
    </g>

    <!-- Sparkles -->
    <g fill="#fff1c2">
      <use href="#vh-star" transform="translate(150 60) scale(0.9)"><animate attributeName="opacity" values="1;0.25;1" dur="3.4s" repeatCount="indefinite"/></use>
      <use href="#vh-star" transform="translate(1048 340) scale(0.8)"><animate attributeName="opacity" values="0.3;1;0.3" dur="4s" repeatCount="indefinite"/></use>
      <use href="#vh-star" transform="translate(1090 70) scale(0.6)"><animate attributeName="opacity" values="1;0.3;1" dur="2.8s" repeatCount="indefinite"/></use>
      <use href="#vh-star" transform="translate(110 330) scale(0.65)"><animate attributeName="opacity" values="0.4;1;0.4" dur="3.7s" repeatCount="indefinite"/></use>
      <use href="#vh-star" transform="translate(330 24) scale(0.5)" opacity="0.8"/>
      <use href="#vh-star" transform="translate(880 378) scale(0.5)" opacity="0.8"/>
    </g>
    <g fill="#fbeab0">
      <circle cx="210" cy="30" r="1.1" opacity="0.8"/>
      <circle cx="420" cy="372" r="1" opacity="0.6"/>
      <circle cx="760" cy="28" r="1.2" opacity="0.7"/>
      <circle cx="970" cy="372" r="1.1" opacity="0.8"/>
      <circle cx="60" cy="210" r="1.2" opacity="0.7"/>
      <circle cx="1142" cy="190" r="1.2" opacity="0.7"/>
      <circle cx="260" cy="350" r="0.9" opacity="0.5"/>
      <circle cx="940" cy="52" r="0.9" opacity="0.5"/>
      <circle cx="505" cy="46" r="0.8" opacity="0.45"/>
      <circle cx="700" cy="352" r="0.8" opacity="0.45"/>
      <circle cx="1120" cy="300" r="1" opacity="0.6"/>
      <circle cx="80" cy="120" r="1" opacity="0.6"/>
    </g>
    <g fill="#c4a8ff" opacity="0.5" filter="url(#vh-blur2)">
      <circle cx="160" cy="62" r="3"/><circle cx="1048" cy="340" r="3"/>
    </g>
  </g>
</svg>`;

        /* VIP avatar frame: gold ring + crown + jewels + sparkles. The vf-* classes are animated in css/12-bigger-ui.css */
        const VIP_FRAME_SVG = (() => {
            const gold = 'url(#vf-gold)', gem = 'url(#vf-gemg)';
            const orn = (x, y, rot, d) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">' +
                '<path d="M-11,3L-19,-2L-10,-7Z" fill="' + gold + '"/><path d="M11,3L19,-2L10,-7Z" fill="' + gold + '"/>' +
                '<path d="M0,-18L8,-6L11,6L0,16L-11,6L-8,-6Z" fill="' + gold + '" stroke="#7a4f08" stroke-width=".9"/>' +
                '<path class="vf-gem" style="animation-delay:' + d + 's" d="M0,-9L5,0L0,9L-5,0Z" fill="' + gem + '" stroke="#fff" stroke-width=".7"/></g>';
            const star = (x, y, s, d) => '<g transform="translate(' + x + ' ' + y + ')"><path class="vf-star" style="animation-delay:' + d + 's" d="M0,-' + s + 'Q1,-1 ' + s + ',0Q1,1 0,' + s + 'Q-1,1 -' + s + ',0Q-1,-1 0,-' + s + 'Z"/></g>';
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" fill="none" aria-hidden="true"><defs>' +
                '<linearGradient id="vf-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#f6c945"/><stop offset=".7" stop-color="#b8821a"/><stop offset="1" stop-color="#f9dc78"/></linearGradient>' +
                '<linearGradient id="vf-navy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d3a8c"/><stop offset="1" stop-color="#04123a"/></linearGradient>' +
                '<radialGradient id="vf-gemg" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#d9f8ff"/><stop offset=".45" stop-color="#3ec3f0"/><stop offset="1" stop-color="#1565c0"/></radialGradient>' +
                '<filter id="vf-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>' +
                '<circle class="vf-glow" cx="100" cy="118" r="85" stroke="#47b4ff" stroke-width="9" filter="url(#vf-blur)"/>' +
                '<circle cx="100" cy="118" r="75" stroke="' + gold + '" stroke-width="11"/>' +
                '<circle cx="100" cy="118" r="79.4" stroke="#fff3b0" stroke-width="1.2" opacity=".75"/>' +
                '<circle cx="100" cy="118" r="70.4" stroke="#7a4f08" stroke-width="1" opacity=".8"/>' +
                '<circle cx="100" cy="118" r="67" stroke="url(#vf-navy)" stroke-width="5"/>' +
                '<g class="vf-shine"><circle cx="100" cy="118" r="75" stroke="#fffbe0" stroke-width="5" stroke-linecap="round" stroke-dasharray="26 445" opacity=".85"/></g>' +
                orn(47, 65, -45, 0) + orn(153, 65, 45, .5) + orn(47, 171, -135, 1) +
                '<g class="vf-crown"><path d="M72,38L66,16L77,27L83,13L92,25L100,8L108,25L117,13L123,27L134,16L128,38Z" fill="' + gold + '" stroke="#7a4f08" stroke-width="1" stroke-linejoin="round"/>' +
                '<g fill="#fff3b0" stroke="#b8821a" stroke-width=".8"><circle cx="66" cy="14" r="3.2"/><circle cx="83" cy="11" r="3.2"/><circle cx="100" cy="5.6" r="3.4"/><circle cx="117" cy="11" r="3.2"/><circle cx="134" cy="14" r="3.2"/></g>' +
                '<rect x="69" y="34" width="62" height="11" rx="3" fill="' + gold + '" stroke="#7a4f08" stroke-width="1"/>' +
                '<path class="vf-gem" d="M100,34.5L105,39.5L100,44.5L95,39.5Z" fill="' + gem + '" stroke="#fff" stroke-width=".7"/>' +
                '<path d="M100,19L103.5,24.5L100,30L96.5,24.5Z" fill="' + gem + '" stroke="#fff" stroke-width=".6"/></g>' +
                '<g fill="#cfeeff">' + star(58, 22, 7, .2) + star(144, 20, 7, 1.1) + star(11, 98, 6, .7) + star(190, 112, 6, 1.6) + star(72, 208, 6, .4) + star(138, 210, 5, 1.3) + '</g></svg>';
        })();
