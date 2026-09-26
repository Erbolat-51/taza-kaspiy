/**
 * Проверка классификатора: npm run ai:test <фото> [<фото> ...] [--comment "текст"] [--mock]
 * Пути считаются от папки, из которой запущен npm (INIT_CWD).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { classifyPhoto } from '../src/ai/classify.js';

const args = process.argv.slice(2);
let comment: string | undefined;
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '--comment') comment = args[++i];
  else if (a === '--mock') delete process.env.ANTHROPIC_API_KEY;
  else files.push(a);
}

if (files.length === 0) {
  console.error('Usage: npm run ai:test <photo> [<photo> ...] [--comment "текст"] [--mock]');
  process.exit(1);
}

const base = process.env.INIT_CWD ?? process.cwd();
for (const f of files) {
  const path = resolve(base, f);
  const image = await readFile(path);
  const r = await classifyPhoto({ image, comment });
  const raw = r.raw as { ms?: number; fallbackReason?: string };
  console.log(`\n📷 ${f}`);
  console.log(
    `   provider=${r.provider}  ${raw.ms} ms${raw.fallbackReason ? `  (fallback: ${raw.fallbackReason})` : ''}`,
  );
  console.log(
    `   isPollution=${r.isPollution}  category=${r.category}  severity=${r.severity}/5  confidence=${r.confidence}`,
  );
  console.log(`   kk: ${r.summaryKk}`);
  console.log(`   ru: ${r.summaryRu}`);
}
