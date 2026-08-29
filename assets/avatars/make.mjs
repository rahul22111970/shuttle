// Generates the preset avatar PNGs. Run once from the app root:
//   node assets/avatars/make.mjs
// Colours here are baked into images, not runtime styles, which is why
// this generator lives beside its output rather than in scripts/.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const P = [
  ["bolt", "#0E7A5A", `<polygon points="54,10 24,54 44,54 40,86 72,40 50,40" fill="#FDFEFE"/>`],
  ["star", "#B4552D", `<polygon points="48,12 57,38 84,38 62,54 70,82 48,65 26,82 34,54 12,38 39,38" fill="#FDFEFE"/>`],
  ["crown", "#4A5899", `<path d="M18 62 L14 30 L34 46 L48 20 L62 46 L82 30 L78 62 Z" fill="#FDFEFE"/><rect x="18" y="66" width="60" height="8" rx="3" fill="#FDFEFE"/>`],
  ["target", "#7A2D4E", `<circle cx="48" cy="48" r="30" fill="none" stroke="#FDFEFE" stroke-width="7"/><circle cx="48" cy="48" r="12" fill="#FDFEFE"/>`],
  ["net", "#2D6B7A", `<g stroke="#FDFEFE" stroke-width="5" stroke-linecap="round"><line x1="24" y1="20" x2="24" y2="76"/><line x1="48" y1="20" x2="48" y2="76"/><line x1="72" y1="20" x2="72" y2="76"/><line x1="16" y1="34" x2="80" y2="34"/><line x1="16" y1="62" x2="80" y2="62"/></g>`],
  ["flame", "#A03A1F", `<path d="M48 10 C56 28 70 34 70 54 C70 70 60 82 48 82 C36 82 26 70 26 54 C26 44 32 38 34 30 C40 40 44 42 46 38 C48 32 46 20 48 10 Z" fill="#FDFEFE"/>`],
  ["peak", "#3E5E45", `<polygon points="12,76 38,26 54,54 64,38 84,76" fill="#FDFEFE"/>`],
  ["wave", "#33628F", `<path d="M12 58 Q24 40 36 58 T60 58 T84 58 L84 74 L12 74 Z" fill="#FDFEFE"/>`],
  ["sun", "#8A6D1F", `<circle cx="48" cy="48" r="17" fill="#FDFEFE"/><g stroke="#FDFEFE" stroke-width="6" stroke-linecap="round"><line x1="48" y1="10" x2="48" y2="22"/><line x1="48" y1="74" x2="48" y2="86"/><line x1="10" y1="48" x2="22" y2="48"/><line x1="74" y1="48" x2="86" y2="48"/><line x1="21" y1="21" x2="30" y2="30"/><line x1="66" y1="66" x2="75" y2="75"/><line x1="75" y1="21" x2="66" y2="30"/><line x1="30" y1="66" x2="21" y2="75"/></g>`],
  ["feather", "#5B4A79", `<path d="M64 12 C40 20 26 44 24 76 L32 76 C34 50 46 28 64 12 Z" fill="#FDFEFE"/><path d="M68 22 C56 34 46 52 42 72 C58 66 70 46 68 22 Z" fill="#FDFEFE"/>`],
  ["shuttle", "#20654F", `<polygon points="26,10 48,56 38,12" fill="#FDFEFE"/><polygon points="42,10 48,56 54,10" fill="#FDFEFE"/><polygon points="58,12 48,56 70,10" fill="#FDFEFE"/><circle cx="48" cy="68" r="12" fill="#FDFEFE"/>`],
  ["moon", "#31536B", `<path d="M62 14 A38 38 0 1 0 82 58 A30 30 0 0 1 62 14 Z" fill="#FDFEFE"/>`],
];

const cell = ([key, bg, mark]) =>
  `<div id="${key}" style="width:96px;height:96px"><svg width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}"/><g opacity="0.94">${mark}</g></svg></div>`;

const html = `<!doctype html><body style="margin:0;display:flex;flex-wrap:wrap">${P.map(cell).join("")}</body>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
for (const [key] of P) {
  const buf = await page.locator(`#${key}`).screenshot();
  writeFileSync(`assets/avatars/preset-${key}.png`, buf);
  console.log(`preset-${key}.png`);
}
await browser.close();
