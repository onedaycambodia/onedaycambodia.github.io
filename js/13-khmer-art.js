        /* ===== Khmer guardians as background art: Lion (tor), Naga, Garuda, Hanuman ===== */
        const KH_ART = (() => {
            const S = (d, x='') => '<path d="'+d+'" fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round" '+x+'/>';
            const K = (d, w=1.6) => '<path d="'+d+'" fill="none" stroke="#000" stroke-width="'+w+'" stroke-linecap="round" stroke-linejoin="round"/>';
            const H = (d) => '<path d="'+d+'" fill="#000"/>';
            const T = (t, c) => '<g transform="'+t+'">'+c+'</g>';
            return {
  lion: () => {
    let m='';
    for (let i=0;i<16;i++) m += T('translate(50 52) rotate('+(i*22.5)+')', S('M0 -18C9 -24 10 -35 2 -46C-4 -38 -9 -30 0 -18Z'));
    for (let i=0;i<16;i++) m += T('translate(50 52) rotate('+(i*22.5+11.25)+')', S('M0 -18C7 -22 8 -30 2 -38C-3 -32 -7 -26 0 -18Z'));
    m += S('M27 30a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z') + S('M61 30a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z') + H('M30 30a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z') + H('M64 30a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z');
    m += S('M28 52a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z');
    m += K('M33 42Q41 34 49 43',2.6) + K('M67 42Q59 34 51 43',2.6);
    m += H('M34 48Q41 41 48 49Q41 52 34 48Z') + H('M66 48Q59 41 52 49Q59 52 66 48Z');
    m += H('M50 33L53 40L50 44L47 40Z') + K('M50 44V52',1.4);
    m += H('M44 54Q50 50 56 54Q54 60 50 61Q46 60 44 54Z');
    m += K('M50 61V66',1.4) + K('M39 66Q45 72 50 66Q55 72 61 66',2) + '<path d="M44 69.5L45.5 74L47.5 70.5Z M52.5 70.5L54.5 74L56 69.5Z" fill="#fff" stroke="#000" stroke-width=".6"/>';
    for (const [x,y] of [[35,59],[32,62],[36,63],[65,59],[68,62],[64,63]]) m += '<circle cx="'+x+'" cy="'+y+'" r="1" fill="#000"/>';
    return m;
  },
  naga: () => {
    let m='';
    const cobra=(a,sc)=>T('translate(50 96) rotate('+a+') scale('+sc+')',
      S('M-4 0V-26H4V0Z') + T('translate(0 -22)',
      S('M-4 0C-5 -12 -17 -20 -15 -36C-14 -46 -7 -50 0 -50C7 -50 14 -46 15 -36C17 -20 5 -12 4 0Z') +
      K('M-8 -26C-12 -20 -9 -12 -4 -13',1.5) + K('M8 -26C12 -20 9 -12 4 -13',1.5) + K('M0 -28V-16',1.3) + K('M-9 -36Q0 -32 9 -36',1.2) +
      S('M-7 -34C-8 -44 -4 -53 0 -55C4 -53 8 -44 7 -34C4 -31 -4 -31 -7 -34Z') +
      H('M-5.6 -44Q-3 -47 -1.2 -43.5Q-3.6 -42 -5.6 -44Z') + H('M5.6 -44Q3 -47 1.2 -43.5Q3.6 -42 5.6 -44Z') + '<circle cx="-1.4" cy="-51" r=".8" fill="#000"/><circle cx="1.4" cy="-51" r=".8" fill="#000"/>'));
    m += cobra(-64,.66)+cobra(64,.66)+cobra(-44,.78)+cobra(44,.78)+cobra(-22,.9)+cobra(22,.9)+cobra(0,1);
    m += S('M8 99C10 86 30 83 50 87C70 83 90 86 92 99Z') + K('M18 94Q50 88 82 94',1.5);
    return m;
  },
  garuda: () => {
    let m='';
    const wing=()=>{ let w=''; [[168,1.05],[190,1.12],[212,1.1],[234,1.02],[256,.9]].forEach(([a,s])=>{ w+=T('translate(40 46) rotate('+a+') scale('+s+')', S('M0 0C4 -10 24 -13 42 -5C32 5 12 9 0 0Z')); });
      [[178,.62],[200,.66],[222,.64],[244,.58]].forEach(([a,s])=>{ w+=T('translate(40 46) rotate('+a+') scale('+s+')', S('M0 0C4 -10 24 -13 42 -5C32 5 12 9 0 0Z')); }); return w; };
    m += wing() + T('translate(100 0) scale(-1 1)', wing());
    [72,90,108].forEach(a=>{ m += T('translate(50 62) rotate('+a+')', S('M0 0C3 -5 14 -6 30 0C14 6 3 5 0 0Z')); });
    const leg=()=>S('M43 60L40 76L35 83L40 85L44 81L47 86L49 79L48 62Z');
    m += leg() + T('translate(100 0) scale(-1 1)', leg());
    const arm=()=>S('M41 43Q29 40 27 28L33 26Q35 34 44 38Z');
    m += arm() + T('translate(100 0) scale(-1 1)', arm());
    m += S('M40 40Q50 36 60 40L63 60Q50 68 37 60Z') + H('M50 44L54 51L50 58L46 51Z') + K('M42 58Q50 62 58 58',1.2);
    m += S('M40 20L42 7L46 14L50 1L54 14L58 7L60 20Z');
    m += S('M41 27a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z');
    m += S('M46 27L54 27L53.5 36Q50 43 46.5 36Z') + K('M50 28V36',1.2);
    m += H('M41.5 24Q45 20.5 48.5 25Q45 27.5 41.5 24Z') + H('M58.5 24Q55 20.5 51.5 25Q55 27.5 58.5 24Z');
    return m;
  },
  hanuman: () => {
    let m='';
    m += S('M18 56a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z') + S('M66 56a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z') + H('M22 56a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z') + H('M70 56a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z');
    m += S('M50 42C68 42 74 53 72 64C70 78 60 86 50 86C40 86 30 78 28 64C26 53 32 42 50 42Z');
    m += S('M36 70C36 64 64 64 64 70C64 80 56 87 50 87C44 87 36 80 36 70Z');
    m += S('M33 43L34 31L40 36L44 23L50 4L56 23L60 36L66 31L67 43Z') + S('M31 41H69V47H31Z') + '<circle cx="50" cy="26" r="3" fill="#000"/>' + K('M42 38V30M58 38V30',1.2);
    m += H('M31 54Q41 47 49 55L49 58Q41 53 32 59Z') + H('M69 54Q59 47 51 55L51 58Q59 53 68 59Z');
    m += H('M36 60Q42 56 47.5 61Q42 64 36 60Z') + H('M64 60Q58 56 52.5 61Q58 64 64 60Z');
    m += K('M50 55V64',1.4) + '<circle cx="46" cy="69" r="1.7" fill="#000"/><circle cx="54" cy="69" r="1.7" fill="#000"/>';
    m += K('M41 78Q50 84 59 78',2) + '<path d="M44 79.2L45.5 83L47.5 80.2Z M52.5 80.2L54.5 83L56 79.2Z" fill="#fff" stroke="#000" stroke-width=".6"/>';
    return m;
  }
};
        })();
        function khSvg(name, cls) {
            return '<svg class="' + cls + '" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="khm-' + name + '" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#000"/><g transform="translate(50 50) scale(.93) translate(-50 -50)">' + KH_ART[name]() + '</g></mask></defs><rect width="100" height="100" fill="currentColor" mask="url(#khm-' + name + ')"/></svg>';
        }
