/**
 * SVG-плейсхолдеры для демо-истории: сцена «небо / море / песок» + предметы по категории.
 * Каждая картинка подписана «DEMO», чтобы на питче было честно видно, что это не реальные фото.
 */
import type { Category } from '@prisma/client';

type Rng = () => number;

const W = 1200;
const H = 900;

const DEFS = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc3e8"/><stop offset="1" stop-color="#dcedf7"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f5f86"/><stop offset="1" stop-color="#4aa3bd"/></linearGradient>
<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdb58a"/><stop offset="1" stop-color="#e6d3ab"/></linearGradient>
<radialGradient id="oil" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#2d2d33"/><stop offset=".7" stop-color="#0c0c0e"/></radialGradient>
<linearGradient id="sheen" x1="0" x2="1"><stop offset="0" stop-color="#6b3fa0" stop-opacity=".5"/><stop offset=".35" stop-color="#2f8f6b" stop-opacity=".5"/><stop offset=".7" stop-color="#c9a227" stop-opacity=".45"/><stop offset="1" stop-color="#8a2f6b" stop-opacity=".45"/></linearGradient>
</defs>`;

function scene(extra: string, label: string, horizon = 300) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${DEFS}
<rect width="${W}" height="${horizon}" fill="url(#sky)"/>
<rect y="${horizon}" width="${W}" height="${520 - horizon}" fill="url(#sea)"/>
<path d="M0 505 Q 300 480 600 510 T 1200 495 L1200 540 Q 900 555 600 540 T 0 548 Z" fill="#f4f6f5" opacity=".75"/>
<rect y="530" width="${W}" height="${H - 530}" fill="url(#sand)"/>
${extra}
<rect x="24" y="${H - 64}" width="${label.length * 13 + 40}" height="40" rx="20" fill="#0B2A3A" opacity=".78"/>
<text x="44" y="${H - 37}" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">${label}</text>
</svg>`;
}

const rand = (r: Rng, a: number, b: number) => a + r() * (b - a);
const sandY = (r: Rng) => rand(r, 580, 820);

const bottle = (r: Rng) => {
  const colors = ['#5dade2', '#48c9b0', '#85c1e9', '#a9dfbf'];
  const c = colors[Math.floor(r() * colors.length)];
  return `<g transform="translate(${rand(r, 40, 1160)},${sandY(r)}) rotate(${rand(r, -90, 90)}) scale(.8)"><rect x="-20" y="-60" width="40" height="105" rx="14" fill="${c}" opacity=".8"/><rect x="-9" y="-84" width="18" height="28" rx="4" fill="${c}"/><rect x="-10" y="-92" width="20" height="10" rx="3" fill="#eee"/><rect x="-20" y="-24" width="40" height="28" fill="#f4f4f4" opacity=".9"/></g>`;
};
const bag = (r: Rng) =>
  `<path transform="translate(${rand(r, 40, 1100)},${sandY(r)}) scale(${rand(r, 0.6, 1.3)})" d="M0 0 C40 -50 110 -30 120 10 C140 60 90 90 40 80 C-10 95 -40 50 0 0Z" fill="#fbfbfb" opacity=".85" stroke="#cfcfcf" stroke-width="3"/>`;
const can = (r: Rng) =>
  `<g transform="translate(${rand(r, 40, 1160)},${sandY(r)}) rotate(${rand(r, 0, 180)})"><rect x="-16" y="-30" width="32" height="60" rx="5" fill="${r() > 0.5 ? '#c0392b' : '#2e86c1'}"/><rect x="-16" y="-8" width="32" height="14" fill="#ecf0f1"/></g>`;
const box = (r: Rng) =>
  `<g transform="translate(${rand(r, 40, 1100)},${sandY(r)}) rotate(${rand(r, -25, 25)})"><rect width="${rand(r, 60, 120)}" height="${rand(r, 40, 80)}" fill="#b98b55" stroke="#8a6436" stroke-width="3"/></g>`;
const paper = (r: Rng) =>
  `<rect transform="translate(${rand(r, 40, 1150)},${sandY(r)}) rotate(${rand(r, 0, 90)})" width="34" height="26" fill="#f2efe6" stroke="#d4cfc0"/>`;
const oilBlob = (r: Rng) => {
  const rx = rand(r, 30, 130);
  const ry = rand(r, 12, 45);
  const x = rand(r, 40, 1160);
  const y = sandY(r);
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#oil)"/><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.35}" rx="${rx * 0.25}" ry="${ry * 0.15}" fill="#fff" opacity=".22"/>`;
};
const seal = (r: Rng) => {
  const x = rand(r, 300, 800);
  const y = rand(r, 640, 740);
  return `<g transform="translate(${x},${y}) rotate(${rand(r, -10, 10)})"><ellipse rx="170" ry="52" fill="#7d8388"/><ellipse cx="-165" cy="-8" rx="46" ry="36" fill="#72787d"/><circle cx="-185" cy="-16" r="5" fill="#222"/><path d="M160 0 L230 -30 L225 30 Z" fill="#6b7075"/><ellipse cx="-40" cy="40" rx="40" ry="12" fill="#5f6469"/></g>`;
};
const fish = (r: Rng) =>
  `<g transform="translate(${rand(r, 60, 1140)},${sandY(r)}) rotate(${rand(r, -30, 30)})"><ellipse rx="34" ry="12" fill="#a7b1b8"/><path d="M30 0 L52 -12 L52 12Z" fill="#98a2a9"/><circle cx="-20" cy="-3" r="2.5" fill="#333"/></g>`;
const slab = (r: Rng) =>
  `<polygon transform="translate(${rand(r, 40, 1080)},${sandY(r)}) rotate(${rand(r, -20, 20)})" points="0,0 ${rand(r, 90, 170)},${rand(r, -15, 10)} ${rand(r, 100, 180)},${rand(r, 40, 70)} ${rand(r, -10, 20)},${rand(r, 45, 75)}" fill="#9a9a96" stroke="#7b7b77" stroke-width="3"/>`;
const brick = (r: Rng) =>
  `<rect transform="translate(${rand(r, 40, 1150)},${sandY(r)}) rotate(${rand(r, 0, 90)})" width="44" height="20" fill="#b5523b" stroke="#8e3d2b"/>`;
const rebar = (r: Rng) => {
  const x = rand(r, 60, 1100);
  const y = sandY(r);
  return `<path d="M${x} ${y} q ${rand(r, 40, 90)} ${rand(r, -40, 20)} ${rand(r, 120, 200)} ${rand(r, -30, 30)}" stroke="#5a4636" stroke-width="5" fill="none"/>`;
};

const repeat = (n: number, f: (r: Rng) => string, r: Rng) =>
  Array.from({ length: n }, () => f(r)).join('');

const LABEL: Record<Category, string> = {
  PLASTIC: 'DEMO · Пластик',
  TRASH: 'DEMO · Қоқыс',
  OIL: 'DEMO · Мұнай',
  DEAD_ANIMAL: 'DEMO · Өлі жануар',
  SEWAGE: 'DEMO · Ағынды су',
  CONSTRUCTION: 'DEMO · Құрылыс қалдығы',
  OTHER: 'DEMO · Ластану',
};

export function pollutionSvg(category: Category, r: Rng): string {
  switch (category) {
    case 'PLASTIC':
      return scene(repeat(14 + Math.floor(r() * 10), bottle, r) + repeat(5, bag, r), LABEL.PLASTIC);
    case 'TRASH':
      return scene(
        repeat(8, can, r) + repeat(4, box, r) + repeat(14, paper, r) + repeat(3, bag, r),
        LABEL.TRASH,
      );
    case 'OIL':
      return scene(
        `<path d="M0 480 Q 300 455 600 490 T 1200 470 L1200 530 L0 530Z" fill="url(#sheen)"/>` +
          repeat(14 + Math.floor(r() * 8), oilBlob, r),
        LABEL.OIL,
      );
    case 'DEAD_ANIMAL':
      return scene(
        r() > 0.35 ? seal(r) + repeat(3, paper, r) : repeat(18, fish, r),
        LABEL.DEAD_ANIMAL,
      );
    case 'SEWAGE':
      return scene(
        `<rect x="-20" y="585" width="260" height="70" rx="12" fill="#6f7478"/><ellipse cx="240" cy="620" rx="18" ry="35" fill="#3d4144"/>
<path d="M255 620 C 420 640, 520 560, 650 520 L 760 520 C 600 600, 420 700, 255 650Z" fill="#6b5a3a" opacity=".85"/>
<path d="M600 505 Q 800 470 1000 505" stroke="#efe9d6" stroke-width="16" fill="none" opacity=".8"/>` +
          repeat(6, paper, r),
        LABEL.SEWAGE,
      );
    case 'CONSTRUCTION':
      return scene(
        repeat(5, slab, r) + repeat(12, brick, r) + repeat(4, rebar, r),
        LABEL.CONSTRUCTION,
      );
    default:
      return scene(repeat(10, paper, r), LABEL.OTHER);
  }
}

/** Фото «после»: чистый песок и следы грабель. */
export function cleanSvg(r: Rng): string {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const y = 590 + i * 26 + rand(r, -4, 4);
    return `<path d="M${rand(r, 0, 200)} ${y} Q 600 ${y + rand(r, -10, 10)} ${rand(r, 1000, 1200)} ${y}" stroke="#c7ae80" stroke-width="3" fill="none" opacity=".7"/>`;
  }).join('');
  return scene(lines, 'DEMO · Тазаланды ✓');
}
