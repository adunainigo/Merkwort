// Genera los iconos PNG a partir de un SVG. Uso: node tools/generar-iconos.mjs
// Necesita Playwright (solo para desarrollo; la app no depende de él):
//   npm i -g playwright && NODE_PATH=$(npm root -g) node tools/generar-iconos.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const svg = (lado, margen, radio) => `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c4cf1"/><stop offset=".6" stop-color="#b45cf6"/><stop offset="1" stop-color="#f06aa6"/></linearGradient></defs>
  <rect width="512" height="512" rx="${radio}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${1 - margen}) translate(-256 -256)">
    <rect x="126" y="150" width="260" height="212" rx="34" fill="#fff" opacity=".25" transform="rotate(-9 256 256)"/>
    <rect x="126" y="150" width="260" height="212" rx="34" fill="#fff"/>
    <text x="256" y="318" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-weight="800" font-size="170" fill="#6c4cf1">V</text>
    <circle cx="214" cy="118" r="17" fill="#fff"/><circle cx="298" cy="118" r="17" fill="#fff"/>
  </g>
</svg>`;

const iconos = [
  ['icon-192.png', 192, 0, 96], ['icon-512.png', 512, 0, 96],
  ['icon-maskable-512.png', 512, 0.22, 0], ['apple-touch-icon.png', 180, 0.06, 0],
];
const navegador = await chromium.launch();
for (const [nombre, lado, margen, radio] of iconos) {
  const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } });
  await pagina.setContent(`<body style="margin:0;background:transparent">${svg(lado, margen, radio)}</body>`);
  await pagina.screenshot({ path: path.join(raiz, nombre), omitBackground: true });
  await pagina.close();
  console.log('✓', nombre);
}
await navegador.close();
