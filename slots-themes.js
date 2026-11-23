// Slot themes: original symbol art and colours. Every theme uses the same maths (slots-engine.js):
// 0-1 low, 2-3 mid, 4 high, 5 top (five on a line = Grand), 6 wild, 7 bonus.
(function (root) {
  const svg = (body, defs = '') => `<svg viewBox="0 0 64 64">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
  const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const letter = (ch, id, a, b, stroke, deco) => svg(
    `${deco || ''}<text x="32" y="${ch === 'Q' ? 48 : 50}" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-weight="700" font-size="${ch.length > 1 ? 40 : 50}" fill="url(#${id})" stroke="${stroke}" stroke-width="2.6" paint-order="stroke">${ch}</text>`,
    grad(id, a, b));
  const star = (cx, cy, r1, r2, n) => { let p = ''; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, t = (Math.PI * i) / n - Math.PI / 2; p += `${(cx + Math.cos(t) * r).toFixed(1)},${(cy + Math.sin(t) * r).toFixed(1)} `; } return p.trim(); };
  const banner = (txt, fill, y = 46) => `<rect x="7" y="${y}" width="50" height="13" rx="3" fill="${fill}" stroke="#f6d77a" stroke-width="1.5"/><text x="32" y="${y + 10}" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="9.5" fill="#fff" letter-spacing="1.4">${txt}</text>`;
  const coin = (inner, label) => `<circle cx="32" cy="30" r="25" fill="#c58a12"/><circle cx="32" cy="30" r="22" fill="url(#coinG)"/><circle cx="32" cy="30" r="17.5" fill="none" stroke="#a46f0a" stroke-width="1.2" stroke-dasharray="2 2.5"/>${inner}${banner(label, '#7a1222', 48)}`;
  const coinDefs = grad('coinG', '#ffe58a', '#e0a21c');

  const THEMES = {
    fruit: {
      id: 'fruit', name: 'Fruit Party', title: ['Fruit', 'Party'],
      names: ['Cherry', 'Lemon', 'Orange', 'Grapes', 'Watermelon', 'Lucky 7', 'Wild', 'Bonus'],
      symbols: [
        svg('<path d="M30 10c-4 10-12 18-16 26M30 10c4 10 9 16 18 22" stroke="#2f7a3a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M30 10c6-4 14-3 18 2-6 2-12 2-18-2z" fill="#3d9a4a"/><circle cx="17" cy="44" r="12" fill="#c8202f"/><circle cx="45" cy="40" r="12" fill="#d62a3a"/><circle cx="13" cy="39" r="3.5" fill="#fff" opacity=".55"/><circle cx="41" cy="35" r="3.5" fill="#fff" opacity=".55"/>'),
        svg('<ellipse cx="32" cy="35" rx="23" ry="17" fill="#f4c81b"/><path d="M9 35c-4 0-5 3-3 5M55 35c4 0 5 3 3 5" stroke="#e0a800" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M33 18c4-8 12-9 16-6-4 6-10 8-16 6z" fill="#3d9a4a"/><ellipse cx="24" cy="29" rx="7" ry="3.5" fill="#fff" opacity=".45"/>'),
        svg('<circle cx="32" cy="36" r="21" fill="#f2861c"/><circle cx="32" cy="36" r="21" fill="url(#orD)" opacity=".35"/><path d="M32 15c2-6 9-8 14-5-3 5-9 7-14 5z" fill="#3d9a4a"/><circle cx="32" cy="16" r="2" fill="#7a4a10"/><ellipse cx="24" cy="28" rx="6" ry="4" fill="#fff" opacity=".4"/>', '<pattern id="orD" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#a8500a"/></pattern>'),
        svg('<path d="M30 6c0 6-1 9-3 11" stroke="#6b4a1e" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M30 10c6-6 14-5 18-1-6 3-12 4-18 1z" fill="#3d9a4a"/>' + [[22, 22], [32, 22], [42, 22], [27, 31], [37, 31], [22, 40], [32, 40], [42, 40], [27, 49], [37, 49], [32, 57]].map(([x, y]) => `<circle cx="${x}" cy="${y - 2}" r="6.4" fill="#7b3aa8"/><circle cx="${x - 2}" cy="${y - 4}" r="1.8" fill="#fff" opacity=".45"/>`).join('')),
        svg('<path d="M4 28a28 28 0 0 0 56 0z" fill="#2f8a3a"/><path d="M8 28a24 24 0 0 0 48 0z" fill="#e8f5c8"/><path d="M11 28a21 21 0 0 0 42 0z" fill="#e83a4a"/>' + [[22, 34], [32, 38], [42, 34], [27, 42], [37, 42], [32, 31]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.6" fill="#2a1a14"/>`).join('')),
        svg('<text x="32" y="54" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-weight="700" font-size="60" fill="url(#sevG)" stroke="#f6d77a" stroke-width="2.6" paint-order="stroke">7</text>', grad('sevG', '#ff4a5a', '#a30f22')),
        svg(`<polygon points="${star(32, 26, 24, 13, 8)}" fill="#ffd34a" stroke="#c98a10" stroke-width="1.5"/><circle cx="32" cy="26" r="9" fill="#fff4c2"/>${banner('WILD', '#d81b60')}`),
        svg(coin(`<polygon points="${star(32, 28, 11, 5, 5)}" fill="#fff6d6" stroke="#a46f0a" stroke-width="1"/>`, 'BONUS'), coinDefs),
      ],
      bonusName: 'Bonus coins',
    },
    safari: {
      id: 'safari', name: 'Safari Gold', title: ['Safari', 'Gold'],
      names: ['J', 'Q', 'K', 'A', 'Elephant', 'Lion', 'Wild', 'Bonus'],
      symbols: [
        letter('J', 'sJ', '#7fc4e8', '#2a6fa0', '#0f2c44'),
        letter('Q', 'sQ', '#9fe07a', '#3a8a2a', '#173a10'),
        letter('K', 'sK', '#ff9a6a', '#c0401a', '#4a1606'),
        letter('A', 'sA', '#ffd86a', '#c98a10', '#4a2c02'),
        svg('<ellipse cx="13" cy="27" rx="12" ry="16" fill="#8e98a4"/><ellipse cx="51" cy="27" rx="12" ry="16" fill="#8e98a4"/><ellipse cx="14" cy="28" rx="7" ry="10" fill="#c7a1a1"/><ellipse cx="50" cy="28" rx="7" ry="10" fill="#c7a1a1"/><ellipse cx="32" cy="27" rx="15" ry="17" fill="#adb6c1"/><path d="M26 36c-2 9 0 16 5 21 3 3 8 2 8-2-4-2-6-8-5-19z" fill="#adb6c1"/><path d="M25 38c-4 4-6 8-5 12M39 38c4 4 6 8 5 12" stroke="#fffbea" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="26" cy="25" r="2.4" fill="#1a1a1a"/><circle cx="38" cy="25" r="2.4" fill="#1a1a1a"/><path d="M24 17c3-3 13-3 16 0" stroke="#8e98a4" stroke-width="1.6" fill="none"/>'),
        svg(`<polygon points="${star(32, 32, 29, 22, 14)}" fill="#c76a12"/><circle cx="32" cy="32" r="22" fill="#e08a24"/><circle cx="19" cy="17" r="5" fill="#d9a35a"/><circle cx="45" cy="17" r="5" fill="#d9a35a"/><ellipse cx="32" cy="35" rx="15" ry="16" fill="#f1c27a"/><ellipse cx="32" cy="42" rx="9" ry="7" fill="#fbe2b4"/><circle cx="26" cy="30" r="2.4" fill="#2a1a10"/><circle cx="38" cy="30" r="2.4" fill="#2a1a10"/><path d="M28 37h8l-4 4z" fill="#5a2a14"/><path d="M32 41v3M28 45c2 2 6 2 8 0" stroke="#5a2a14" stroke-width="1.5" fill="none" stroke-linecap="round"/>`),
        svg(`<rect x="5" y="5" width="54" height="40" rx="6" fill="url(#sunG)"/><circle cx="32" cy="30" r="11" fill="#ffe27a"/><path d="M5 38h54v7H5z" fill="#3a1a0a"/><path d="M30 38c0-8 1-12 3-16M33 26c-8-2-16 0-22 3 6 2 14 1 22-3zm0 0c8-3 16-2 21 1-6 2-13 2-21-1z" stroke="#1a0c04" stroke-width="2.6" fill="#1a0c04" stroke-linejoin="round"/>${banner('WILD', '#7a1222')}`, grad('sunG', '#ff8a3a', '#c2301c')),
        svg(coin('<ellipse cx="32" cy="33" rx="7" ry="6" fill="#7a4a10"/><ellipse cx="23" cy="25" rx="3.2" ry="4.2" fill="#7a4a10"/><ellipse cx="29" cy="20" rx="3.2" ry="4.2" fill="#7a4a10"/><ellipse cx="35" cy="20" rx="3.2" ry="4.2" fill="#7a4a10"/><ellipse cx="41" cy="25" rx="3.2" ry="4.2" fill="#7a4a10"/>', 'BONUS'), coinDefs),
      ],
      bonusName: 'Gold paws',
    },
    ocean: {
      id: 'ocean', name: 'Ocean Treasure', title: ['Ocean', 'Treasure'],
      names: ['J', 'Q', 'K', 'A', 'Turtle', 'Golden fish', 'Wild', 'Bonus'],
      symbols: [
        letter('J', 'oJ', '#8fe3ff', '#1a7ab0', '#062b45'),
        letter('Q', 'oQ', '#ff9ec2', '#c0306a', '#3a0a20'),
        letter('K', 'oK', '#b7f08a', '#3a9a3a', '#0f3a10'),
        letter('A', 'oA', '#ffe08a', '#d08a10', '#3a2402'),
        svg('<ellipse cx="14" cy="42" rx="9" ry="5" fill="#3f9a5a" transform="rotate(-30 14 42)"/><ellipse cx="50" cy="42" rx="9" ry="5" fill="#3f9a5a" transform="rotate(30 50 42)"/><ellipse cx="16" cy="20" rx="8" ry="4.5" fill="#3f9a5a" transform="rotate(30 16 20)"/><ellipse cx="48" cy="20" rx="8" ry="4.5" fill="#3f9a5a" transform="rotate(-30 48 20)"/><circle cx="32" cy="9" r="7" fill="#5ab478"/><circle cx="29.5" cy="7.5" r="1.4" fill="#122"/><circle cx="34.5" cy="7.5" r="1.4" fill="#122"/><ellipse cx="32" cy="34" rx="19" ry="21" fill="#2d6a3a"/><path d="M32 18l9 6v12l-9 6-9-6V24z" fill="#6ab45a" stroke="#1e4a26" stroke-width="1.4"/><path d="M32 18v-3M41 24l8-4M41 36l8 4M32 42v10M23 36l-8 4M23 24l-8-4" stroke="#1e4a26" stroke-width="1.4"/>'),
        svg('<path d="M48 32l12-12v24z" fill="#e0a21c"/><ellipse cx="30" cy="32" rx="22" ry="15" fill="url(#fishG)"/><path d="M26 17c4-6 12-6 16 0z" fill="#e0a21c"/><path d="M26 47c4 5 10 5 14 0z" fill="#e0a21c"/><circle cx="17" cy="29" r="3.6" fill="#fff"/><circle cx="16.4" cy="29" r="2" fill="#122"/><path d="M30 22c3 6 3 14 0 20M37 22c3 6 3 14 0 20" stroke="#c07a0a" stroke-width="1.4" fill="none" opacity=".7"/><ellipse cx="24" cy="25" rx="6" ry="2.6" fill="#fff" opacity=".5"/>', grad('fishG', '#ffe58a', '#e8901c')),
        svg(`<path d="M32 8c-14 0-25 10-25 22 0 3 1 6 2 8h46c1-2 2-5 2-8 0-12-11-22-25-22z" fill="url(#shG)"/>${[14, 20, 26, 32, 38, 44, 50].map(x => `<path d="M32 38L${x} 10" stroke="#c0567a" stroke-width="1.2" opacity=".55"/>`).join('')}<circle cx="32" cy="34" r="7" fill="url(#prG)"/><circle cx="29.5" cy="31.5" r="2" fill="#fff"/>${banner('WILD', '#0e6c8c')}`, grad('shG', '#ffd0e0', '#e07aa0') + '<radialGradient id="prG"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd8e6"/></radialGradient>'),
        svg(`<path d="M8 28h48v20H8z" fill="#7a4a1e"/><path d="M8 28c0-12 10-18 24-18s24 6 24 18z" fill="#9a5e26"/><path d="M8 28h48M8 40h48" stroke="#e0a21c" stroke-width="3"/><path d="M18 12v36M46 12v36" stroke="#e0a21c" stroke-width="3"/><rect x="28" y="30" width="8" height="9" rx="1.5" fill="#ffd34a" stroke="#8a5a0a"/><circle cx="20" cy="27" r="3" fill="#ffd34a"/><circle cx="26" cy="25" r="3" fill="#ffe58a"/><circle cx="40" cy="26" r="3" fill="#ffd34a"/>${banner('BONUS', '#7a1222', 49)}`),
      ],
      bonusName: 'Treasure chests',
    },
  };
  root.SLOT_THEMES = THEMES;
})(this);
