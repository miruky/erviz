import './style.css';
import { parseSchema } from './parse';
import { layoutSchema, type Layout } from './layout';
import { renderSvg } from './render';
import { sampleDdl } from './sample';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`要素 #${id} が見つからない`);
  return el as T;
}

const ddl = byId<HTMLTextAreaElement>('ddl');
const canvas = byId<HTMLDivElement>('canvas');
const stats = byId<HTMLSpanElement>('stats');
const warningsEl = byId<HTMLUListElement>('warnings');
const statusEl = byId<HTMLSpanElement>('status');

let svgText = '';
let lastLayout: Layout = { boxes: [], width: 0, height: 0 };

// 表示変換(パン・ズーム)。SVG自体は再生成せずCSS transformだけ動かす
const view = { x: 0, y: 0, k: 1 };

function applyView(): void {
  const svg = canvas.querySelector('svg');
  if (svg === null) return;
  svg.style.transformOrigin = '0 0';
  svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
}

function fit(): void {
  const w = lastLayout.width;
  const h = lastLayout.height;
  if (w <= 0 || h <= 0) {
    view.x = 0;
    view.y = 0;
    view.k = 1;
    applyView();
    return;
  }
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  view.k = Math.min(cw / w, ch / h, 1.5) * 0.94;
  view.x = (cw - w * view.k) / 2;
  view.y = (ch - h * view.k) / 2;
  applyView();
}

function render(refit: boolean): void {
  const schema = parseSchema(ddl.value);
  lastLayout = layoutSchema(schema);
  svgText = renderSvg(lastLayout, schema);
  canvas.innerHTML = svgText;

  const svg = canvas.querySelector('svg');
  if (svg !== null && lastLayout.width > 0) {
    svg.setAttribute('width', String(lastLayout.width));
    svg.setAttribute('height', String(lastLayout.height));
  }

  stats.textContent = `${schema.tables.length} テーブル / ${schema.relations.length} リレーション`;
  warningsEl.replaceChildren(
    ...schema.warnings.map((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      return li;
    }),
  );
  if (refit) fit();
  else applyView();
}

let timer: ReturnType<typeof setTimeout> | undefined;
ddl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => render(false), 200);
});

// パン: ドラッグで移動
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  view.x += e.clientX - lastX;
  view.y += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  applyView();
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture(e.pointerId);
  canvas.classList.remove('dragging');
});

// ズーム: ホイールでポインタ位置を中心に拡縮
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = Math.min(4, Math.max(0.15, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.x = px - ((px - view.x) * k) / view.k;
    view.y = py - ((py - view.y) * k) / view.k;
    view.k = k;
    applyView();
  },
  { passive: false },
);

canvas.addEventListener('dblclick', fit);

function zoomBy(factor: number): void {
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;
  const k = Math.min(4, Math.max(0.15, view.k * factor));
  view.x = cx - ((cx - view.x) * k) / view.k;
  view.y = cy - ((cy - view.y) * k) / view.k;
  view.k = k;
  applyView();
}

byId<HTMLButtonElement>('zoom-in').addEventListener('click', () => zoomBy(1.25));
byId<HTMLButtonElement>('zoom-out').addEventListener('click', () => zoomBy(0.8));
byId<HTMLButtonElement>('zoom-fit').addEventListener('click', fit);

let statusTimer: ReturnType<typeof setTimeout> | undefined;
function flashStatus(msg: string): void {
  statusEl.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = '';
  }, 1800);
}

byId<HTMLButtonElement>('sample').addEventListener('click', () => {
  ddl.value = sampleDdl;
  render(true);
});

byId<HTMLButtonElement>('download').addEventListener('click', () => {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'erviz.svg';
  a.click();
  URL.revokeObjectURL(url);
  flashStatus('ダウンロードしました');
});

byId<HTMLButtonElement>('copy').addEventListener('click', () => {
  navigator.clipboard
    .writeText(svgText)
    .then(() => flashStatus('SVGをコピーしました'))
    .catch(() => flashStatus('コピーできませんでした'));
});

ddl.value = sampleDdl;
render(true);
