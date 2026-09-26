/**
 * Проверка классификатора: npm run ai:test <фото|папка> [...] [--comment "текст"] [--mock]
 * Пути считаются от папки, из которой запущен npm (INIT_CWD). В конце — сводная таблица.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { classifyPhoto, providerChain } from '../src/ai/classify.js';
import { stopClip, warmupClip } from '../src/ai/clip.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif']);

const args = process.argv.slice(2);
let comment: string | undefined;
const inputs: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '--comment') comment = args[++i];
  else if (a === '--mock') process.env.AI_PROVIDER = 'mock';
  else if (a === '--provider') process.env.AI_PROVIDER = args[++i];
  else inputs.push(a);
}

if (inputs.length === 0) {
  console.error(
    'Usage: npm run ai:test <photo|dir> [...] [--comment "текст"] [--provider auto|claude|clip|mock]',
  );
  process.exit(1);
}

const base = process.env.INIT_CWD ?? process.cwd();
const files: string[] = [];
for (const input of inputs) {
  const path = resolve(base, input);
  if ((await stat(path)).isDirectory()) {
    const entries = (await readdir(path)).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
    files.push(...entries.sort().map((f) => join(path, f)));
  } else {
    files.push(path);
  }
}

console.log(`Цепочка провайдеров: ${providerChain().join(' → ')}`);
if (providerChain().includes('clip')) {
  const t0 = performance.now();
  await warmupClip().catch(() => {});
  console.log(`CLIP загружен и прогрет за ${Math.round(performance.now() - t0)} ms`);
}

const rows: string[][] = [];
for (const path of files) {
  const r = await classifyPhoto({ image: await readFile(path), comment });
  const raw = r.raw as {
    ms?: number;
    fallbackReason?: string;
    top3?: { cls: string; score: number }[];
  };
  console.log(`\n📷 ${basename(path)} — ${r.provider}, ${raw.ms} ms`);
  console.log(`   kk: ${r.summaryKk}\n   ru: ${r.summaryRu}`);
  rows.push([
    basename(path),
    r.category,
    `${r.severity}/5`,
    r.confidence.toFixed(2),
    String(r.isPollution),
    String(raw.ms),
    raw.top3?.map((c) => `${c.cls} ${c.score.toFixed(2)}`).join(', ') ?? '—',
    r.provider + (raw.fallbackReason ? ` (${raw.fallbackReason})` : ''),
  ]);
}

const header = [
  'файл',
  'категория',
  'severity',
  'confidence',
  'isPollution',
  'ms',
  'top-3',
  'provider',
];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
const line = (cells: string[]) =>
  '| ' + cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ') + ' |';
console.log('\n' + line(header));
console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
rows.forEach((r) => console.log(line(r)));

stopClip();
