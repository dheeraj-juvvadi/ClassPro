const wrap = (title, style, art) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 300" data-art-style="${style}"><title>${title}</title>${art}</svg>\n`;
const path = (d, fill, more = '') => `<path d="${d}" fill="${fill}" ${more}/>`;

function firstLight() {
  return wrap('First Light — painted alpine lake', 'painted', `
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#294c51"/><stop offset=".7" stop-color="#8db8a5"/><stop offset="1" stop-color="#e7ddb2"/></linearGradient>
  <linearGradient id="lake" x2="0" y2="1"><stop stop-color="#83b1a0"/><stop offset="1" stop-color="#244d49"/></linearGradient></defs>
  <path fill="url(#sky)" d="M0 0h1440v300H0z"/>
  <circle cx="1110" cy="90" r="54" fill="#e8dec0" opacity=".16"/><circle cx="1110" cy="90" r="34" fill="#f0e8c4" opacity=".6"/>
  ${path('M0 175 85 149 142 82 194 107 264 46 328 93 382 113 444 154 520 116 600 153 686 96 754 134 812 107 900 165 982 136 1050 150 1150 111 1244 154 1340 93 1440 130V300H0Z', '#82a69b')}
  ${path('m196 110 68-64 64 47-44-12-21-14-23 28Z M630 130l56-34 68 38-42-9-25-15-26 17Z', '#d5dfc9')}
  ${path('M0 180Q110 108 230 173T460 177Q548 119 650 165T870 170Q997 137 1065 175T1250 158Q1320 137 1440 162V300H0Z', '#547f74')}
  ${path('M0 224Q75 165 185 206T356 222Q450 191 525 218T703 217Q824 201 884 220T1091 218Q1280 184 1440 204V300H0Z', '#365f57')}
  ${path('M0 235Q260 224 470 239T820 234Q1100 223 1440 237V300H0Z', 'url(#lake)')}
  ${Array.from({ length: 11 }, (_, i) => `<path d="M${810 - i * 20} ${240 + i * 4}q${140 + i * 8} -3 ${235 + i * 26} 0" fill="none" stroke="#c0d0ae" stroke-width="${i % 3 + 1}" opacity="${.4 - i * .024}"/>`).join('')}
  <path d="M80 178Q250 158 436 186M580 192q150-10 288 1" fill="none" stroke="#c0d2bc" stroke-width="7" opacity=".16"/>
  ${Array.from({ length: 19 }, (_, i) => { const x = i < 10 ? i * 19 : 1240 + (i - 10) * 25, h = 28 + (i * 17 % 43); return path(`M${x} 286v-${h}m0 2-13 26h7l-15 22h13l-13 16h42l-14-16h12l-15-22h7Z`, '#234942'); }).join('')}`);
}

function emberCoast() {
  return wrap('Ember Coast — screenprinted ocean sunset', 'screenprint', `
  <defs><pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="#522b41" opacity=".18"/></pattern></defs>
  <path fill="#d58164" d="M0 0h1440v300H0z"/>
  <path fill="#a95354" d="M0 0h1440v53H0z"/><path fill="#c66b59" d="M0 53h1440v42H0z"/>
  <circle cx="1080" cy="134" r="84" fill="#f4c17a"/>
  ${path('M0 173Q130 157 225 173T470 179Q532 171 607 178T810 180Q987 174 1440 179V300H0Z', '#894354')}
  ${Array.from({ length: 12 }, (_, i) => `<path d="M${950 - i * 8} ${184 + i * 8}q100 -4 ${250 + i * 9} 0" stroke="#e49b6a" stroke-width="${2 + i % 3}" fill="none"/>`).join('')}
  ${Array.from({ length: 8 }, (_, i) => `<path d="M-40 ${190 + i * 15}q110 -15 240 0t260 0t280 0t340 0t360 0" stroke="#b36560" stroke-width="2" fill="none"/>`).join('')}
  ${path('M0 214q110-17 165 18t128 45q82-10 145 23H0Z M1320 280l120-33v53h-189Z', '#492e40')}
  <g fill="none" stroke="#492e40" stroke-linecap="round"><path d="M144 290Q112 185 158 107M86 280Q61 206 85 155" stroke-width="8"/>
  <path d="M158 107q-42-39-83 4m83-4q53-32 95 12m-95-12q-52 1-69 46m69-46q41 3 50 49M85 155q-43-17-62 14m62-14q39-16 62 13" stroke-width="10"/></g>
  <path d="M875 204h18l-4-64h-10Z" fill="#efbf92"/><path d="M877 157h14v8h-14zM876 179h16v7h-16z" fill="#a75653"/>
  <path d="M874 135h21v8h-21zM880 129h9v6h-9z" fill="#562f44"/>
  <path d="M0 0h1440v300H0z" fill="url(#grain)"/>`);
}

function romanNocturne() {
  let buildings = '';
  for (let i = 0; i < 39; i++) {
    const x = i * 39 - 12, top = 184 - (i * 17 % 51), w = 30 + i % 4 * 3;
    buildings += `<path d="M${x} 280V${top}h${w}v${280 - top}" fill="#20345a" stroke="#6286b5" stroke-width="1.3"/>`;
    for (let y = top + 10; y < 257; y += 14) for (let xx = x + 7; xx < x + w - 3; xx += 10) {
      buildings += `<path d="M${xx} ${y}v5" stroke="${(xx + y) % 7 < 2 ? '#e3c396' : '#496f9e'}" stroke-width="2"/>`;
    }
  }
  let arches = '';
  for (let tier = 0; tier < 3; tier++) for (let col = 0; col < 14; col++) {
    const x = 871 + col * 20, y = 198 + tier * 25;
    arches += `<path d="M${x} ${y + 16}v-10q6-11 12 0v10Z" fill="#172640" stroke="#799bc4" stroke-width="1"/>`;
  }
  return wrap('Roman Nocturne — ink and lamplight', 'ink', `
  <path fill="#14223d" d="M0 0h1440v300H0z"/>
  <g fill="#8faad0">${Array.from({ length: 45 }, (_, i) => `<circle cx="${(i * 191 + 38) % 1440}" cy="${(i * 37) % 95 + 8}" r="${i % 8 ? .8 : 1.6}"/>`).join('')}</g>
  <path d="M1230 23a23 23 0 1 0 28 35 21 21 0 0 1-28-35Z" fill="#c6d9ed"/>
  ${buildings}
  <g stroke="#81a1ca" stroke-width="1.6" fill="#263e66">
    <path d="M375 274v-59h105v59M390 215v-23h76v23M389 191a39 56 0 0 1 78 0Z"/>
    <path d="M425 133v-15h7v15M429 118v-16m-6 6h12M429 137v55M403 151q-2 20-3 41M452 151q3 20 3 41" fill="none"/>
    <path d="M381 215h94M376 225h104M383 237h91M861 277v-99q150-38 309 4v95Z"/>
    <path d="M861 192q152-32 309 4M861 222q152-15 309 0M861 248h309" fill="none"/>
    <path d="M670 275V147h27v128M667 147h33M674 137h19l-10-17Z"/>
  </g>${arches}
  <g stroke="#92afd0" fill="none">${Array.from({ length: 10 }, (_, i) => `<path d="M${386 + i * 9} 242v32"/>`).join('')}
  <path d="M678 170v13m10-13v13m-10 14v13m10-13v13"/></g>
  <path d="M0 280h1440v20H0z" fill="#111d32"/><path d="M0 280h1440" stroke="#6486af"/>
  ${[92, 314, 577, 799, 1195, 1370].map(x => `<path d="M${x} 280v-26m-5 0h10" stroke="#89a4c3" stroke-width="2"/><circle cx="${x}" cy="254" r="3" fill="#ebcf9e"/>`).join('')}`);
}

function saffronDunes() {
  return wrap('Saffron Dunes — contour drawing in gold', 'contour', `
  <path fill="#685330" d="M0 0h1440v300H0z"/><circle cx="1114" cy="95" r="39" fill="none" stroke="#dcc18a" stroke-width="1.5"/>
  <circle cx="1114" cy="95" r="34" fill="none" stroke="#b49a62" stroke-width=".7"/>
  ${path('M0 182Q225 16 507 178T991 159Q1226 35 1440 165V300H0Z', '#96763e')}
  ${path('M0 246Q315 132 586 223T1022 211Q1271 93 1440 198V300H0Z', '#7c602f')}
  ${Array.from({ length: 19 }, (_, i) => `<path d="M-50 ${188 + i * 8}Q225 ${23 + i * 9} 507 ${184 + i * 7}T991 ${165 + i * 8}Q1226 ${41 + i * 10} 1490 ${171 + i * 8}" fill="none" stroke="${i % 3 ? '#c2a264' : '#e2c68b'}" stroke-width="${i % 3 ? .65 : 1.2}" opacity=".7"/>`).join('')}
  <g stroke="#ddc287" fill="none" stroke-width="1.5"><path d="M956 222v-28l18-12 18 12v28m-36-28h36m-29 28v-15h10v15m8 0v-15h6v15"/>
  <path d="M1060 227q-8-44 4-65m-2 15q-23-21-38 0m38 0q18-23 36-6m-36 6q-30-3-32 16m32-16q23-5 30 10"/></g>`);
}

function rosewoodValley() {
  return wrap('Rosewood Valley — layered paper blossoms', 'paper-cut', `
  <path fill="#c398a6" d="M0 0h1440v300H0z"/><circle cx="1080" cy="80" r="48" fill="#e9d3cb"/>
  ${path('M0 133C170 34 266 149 441 134S623 44 806 119 1100 80 1231 125 1370 96 1440 116V300H0Z', '#a77894')}
  ${path('M0 202C143 99 370 216 530 152S831 208 1010 169 1270 177 1440 158V300H0Z', '#7c5477')}
  ${path('M0 252C240 187 381 274 600 237S824 217 990 254 1250 197 1440 242V300H0Z', '#513d5d')}
  ${[290, 331, 374, 417, 467].map((x, i) => `<path d="M${x} ${190 - i * 4}v-30h29v30Z" fill="${i % 2 ? '#d8b5b1' : '#bd959f'}"/><path d="m${x - 6} ${160 - i * 4} 20-18 20 18Z" fill="#643f64"/><path d="M${x + 12} ${172 - i * 4}v14" stroke="#735069" stroke-width="7"/>`).join('')}
  ${[60, 180, 736, 1260, 1390].map((x, i) => `<path d="M${x} 295q-8-65 5-125m-5 59-34-27m35 8 23-27" stroke="#44344e" stroke-width="7" fill="none"/>
  <g fill="${i % 2 ? '#c792b0' : '#ddb3c3'}"><circle cx="${x}" cy="177" r="29"/><circle cx="${x - 25}" cy="191" r="26"/><circle cx="${x + 28}" cy="187" r="31"/><circle cx="${x + 6}" cy="153" r="25"/></g>
  <path d="M${x - 29} 175q13-17 30-9m3-14q13 0 19 15m-24 26q18-7 32 3" stroke="#ebccd1" stroke-width="2" fill="none"/>`).join('')}
  ${Array.from({ length: 32 }, (_, i) => `<ellipse cx="${(i * 137 + 42) % 1440}" cy="${231 + i % 7 * 9}" rx="3" ry="1.5" fill="#c38da6" transform="rotate(-25 ${(i * 137 + 42) % 1440} ${231 + i % 7 * 9})"/>`).join('')}`);
}

export const styledScenes = {
  sunrise: firstLight,
  sunset: emberCoast,
  moonlight: romanNocturne,
  sand: saffronDunes,
  clay: rosewoodValley,
};
