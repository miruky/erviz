import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { parseSchema } from './parse';
import { layoutSchema, type Direction, type Layout } from './layout';
import { renderSvg } from './render';
import { ddlToSvg } from './index';
import { defaultExample, examples } from './examples';
import {
  nextPref,
  readStoredPref,
  resolveTheme,
  storePref,
  themeLabel,
  type ThemePref,
} from './theme';
import { buildShareHash, readShareHash } from './share';
import { svgToPngBlob } from './png';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`要素 #${id} が見つからない`);
  return el as T;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/* ---- テーマ ---- */
let themePref: ThemePref = readStoredPref(localStorage);
const themeBtn = byId<HTMLButtonElement>('theme');
const themeLabelEl = byId<HTMLSpanElement>('theme-label');

function applyTheme(): void {
  const resolved = resolveTheme(themePref, darkQuery.matches);
  document.documentElement.dataset.theme = resolved;
  themeLabelEl.textContent = themeLabel(themePref);
  themeBtn.setAttribute('aria-label', `テーマ: ${themeLabel(themePref)}。クリックで切り替え`);
}
themeBtn.addEventListener('click', () => {
  themePref = nextPref(themePref);
  storePref(localStorage, themePref);
  applyTheme();
});
darkQuery.addEventListener('change', () => {
  if (themePref === 'system') applyTheme();
});
applyTheme();

/* ---- 状態 ---- */
const DDL_KEY = 'erviz:ddl';
const DIR_KEY = 'erviz:direction';

const ddl = byId<HTMLTextAreaElement>('ddl');
const canvas = byId<HTMLDivElement>('canvas');
const stats = byId<HTMLSpanElement>('stats');
const warningsEl = byId<HTMLUListElement>('warnings');
const zoomLevel = byId<HTMLSpanElement>('zoom-level');
const dirBtn = byId<HTMLButtonElement>('direction');

let direction: Direction = localStorage.getItem(DIR_KEY) === 'TB' ? 'TB' : 'LR';
let svgText = '';
let lastLayout: Layout = { boxes: [], width: 0, height: 0, direction };
const view = { x: 0, y: 0, k: 1 };

function applyView(): void {
  const svg = canvas.querySelector('svg');
  if (svg === null) return;
  svg.style.transformOrigin = '0 0';
  svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
  zoomLevel.textContent = `${Math.round(view.k * 100)}%`;
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
  view.k = Math.min(cw / w, ch / h, 1.5) * 0.92;
  view.x = (cw - w * view.k) / 2;
  view.y = (ch - h * view.k) / 2;
  applyView();
}

function clamp(k: number): number {
  return Math.min(4, Math.max(0.1, k));
}

function render(refit: boolean): void {
  const schema = parseSchema(ddl.value);
  lastLayout = layoutSchema(schema, { direction });
  svgText = renderSvg(lastLayout, schema);
  canvas.innerHTML = svgText;

  const svg = canvas.querySelector('svg');
  if (svg !== null && lastLayout.width > 0) {
    svg.setAttribute('width', String(lastLayout.width));
    svg.setAttribute('height', String(lastLayout.height));
  }
  if (!reduceMotion.matches) {
    canvas.classList.add('entering');
    window.setTimeout(() => canvas.classList.remove('entering'), 450);
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

/* ---- 入力と永続化 ---- */
let timer: ReturnType<typeof setTimeout> | undefined;
ddl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    render(false);
    try {
      localStorage.setItem(DDL_KEY, ddl.value);
    } catch {
      /* 保存できなくても描画は続ける */
    }
  }, 200);
  clearChipSelection();
});

/* ---- パン・ズーム ---- */
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  clearHighlight();
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  view.x += e.clientX - lastX;
  view.y += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  applyView();
});
function endDrag(e: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* キャプチャ済みでない場合は無視 */
  }
  canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015));
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
  const k = clamp(view.k * factor);
  view.x = cx - ((cx - view.x) * k) / view.k;
  view.y = cy - ((cy - view.y) * k) / view.k;
  view.k = k;
  applyView();
}
byId<HTMLButtonElement>('zoom-in').addEventListener('click', () => zoomBy(1.25));
byId<HTMLButtonElement>('zoom-out').addEventListener('click', () => zoomBy(0.8));
byId<HTMLButtonElement>('zoom-fit').addEventListener('click', fit);

/* ---- ホバーで関連を強調 ---- */
function clearHighlight(): void {
  canvas.classList.remove('has-focus');
  canvas.querySelectorAll('.lit').forEach((el) => el.classList.remove('lit'));
}
function lightTable(name: string): void {
  const svg = canvas.querySelector('svg');
  if (svg === null) return;
  const lower = name.toLowerCase();
  const lit = new Set<string>([lower]);
  svg.querySelectorAll<SVGElement>('.edge').forEach((edge) => {
    const from = (edge.dataset.from ?? '').toLowerCase();
    const to = (edge.dataset.to ?? '').toLowerCase();
    if (from === lower || to === lower) {
      edge.classList.add('lit');
      lit.add(from);
      lit.add(to);
    }
  });
  svg.querySelectorAll<SVGElement>('.tbl').forEach((tbl) => {
    if (lit.has((tbl.dataset.table ?? '').toLowerCase())) tbl.classList.add('lit');
  });
  canvas.classList.add('has-focus');
}
canvas.addEventListener('pointerover', (e) => {
  if (dragging) return;
  const target = e.target as Element;
  const tbl = target.closest<SVGElement>('.tbl');
  if (tbl !== null && tbl.dataset.table !== undefined) {
    clearHighlight();
    lightTable(tbl.dataset.table);
    return;
  }
  const edge = target.closest<SVGElement>('.edge');
  if (edge !== null) {
    clearHighlight();
    const from = (edge.dataset.from ?? '').toLowerCase();
    const to = (edge.dataset.to ?? '').toLowerCase();
    edge.classList.add('lit');
    canvas.querySelectorAll<SVGElement>('.tbl').forEach((tbl) => {
      const name = (tbl.dataset.table ?? '').toLowerCase();
      if (name === from || name === to) tbl.classList.add('lit');
    });
    canvas.classList.add('has-focus');
  }
});
canvas.addEventListener('pointerleave', clearHighlight);

/* ---- 向きの切り替え ---- */
function setDirection(next: Direction): void {
  direction = next;
  localStorage.setItem(DIR_KEY, direction);
  dirBtn.textContent = direction === 'LR' ? '縦並びにする' : '横並びにする';
  dirBtn.setAttribute('aria-pressed', direction === 'TB' ? 'true' : 'false');
  render(true);
}
dirBtn.addEventListener('click', () => setDirection(direction === 'LR' ? 'TB' : 'LR'));

/* ---- トースト ---- */
const statusEl = byId<HTMLDivElement>('status');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string): void {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  requestAnimationFrame(() => statusEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    statusEl.classList.remove('show');
  }, 1900);
}

/* ---- 書き出し ---- */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

byId<HTMLButtonElement>('download').addEventListener('click', () => {
  downloadBlob(new Blob([svgText], { type: 'image/svg+xml' }), 'erviz.svg');
  toast('SVGを保存しました');
});

byId<HTMLButtonElement>('copy').addEventListener('click', () => {
  navigator.clipboard
    .writeText(svgText)
    .then(() => toast('SVGをコピーしました'))
    .catch(() => toast('コピーできませんでした'));
});

byId<HTMLButtonElement>('png').addEventListener('click', () => {
  if (lastLayout.boxes.length === 0) {
    toast('図がありません');
    return;
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  svgToPngBlob(svgText, 2, bg)
    .then((blob) => {
      downloadBlob(blob, 'erviz.png');
      toast('PNGを保存しました');
    })
    .catch(() => toast('PNGの変換に失敗しました'));
});

byId<HTMLButtonElement>('share').addEventListener('click', () => {
  const hash = buildShareHash(ddl.value);
  if (hash === null) {
    toast('スキーマが大きすぎて共有リンクを作れません');
    return;
  }
  history.replaceState(null, '', hash);
  const url = location.href;
  navigator.clipboard
    .writeText(url)
    .then(() => toast('共有リンクをコピーしました'))
    .catch(() => toast('リンクをURLに設定しました'));
});

/* ---- サンプルのチップとギャラリー ---- */
const chipBox = byId<HTMLDivElement>('example-chips');
function clearChipSelection(): void {
  chipBox.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
}
function loadExample(id: string, scroll: boolean): void {
  const ex = examples.find((e) => e.id === id);
  if (ex === undefined) return;
  ddl.value = ex.ddl;
  try {
    localStorage.setItem(DDL_KEY, ex.ddl);
  } catch {
    /* 保存失敗は無視 */
  }
  render(true);
  clearChipSelection();
  chipBox.querySelector(`[data-id="${id}"]`)?.setAttribute('aria-pressed', 'true');
  if (scroll) byId('studio').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}
for (const ex of examples) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = ex.name;
  chip.dataset.id = ex.id;
  chip.setAttribute('aria-pressed', 'false');
  chip.addEventListener('click', () => loadExample(ex.id, false));
  chipBox.appendChild(chip);
}

const gallery = byId<HTMLUListElement>('gallery');
for (const ex of examples) {
  const li = document.createElement('li');
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.setAttribute('aria-label', `${ex.name} のスキーマを読み込む`);

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.innerHTML = ddlToSvg(ex.ddl);
  thumb.querySelector('svg')?.removeAttribute('width');
  thumb.querySelector('svg')?.removeAttribute('height');

  const body = document.createElement('div');
  body.className = 'card-body';
  const h3 = document.createElement('h3');
  h3.textContent = ex.name;
  const sum = document.createElement('p');
  sum.className = 'summary';
  sum.textContent = ex.summary;
  const open = document.createElement('span');
  open.className = 'open';
  open.textContent = 'スタジオで開く →';
  body.append(h3, sum, open);

  card.append(thumb, body);
  card.addEventListener('click', () => loadExample(ex.id, true));
  li.appendChild(card);
  gallery.appendChild(li);
}

/* ---- 対応構文のマーキー ---- */
const SYNTAX = [
  'CREATE TABLE',
  'FOREIGN KEY',
  'REFERENCES',
  'ON DELETE CASCADE',
  'PRIMARY KEY',
  'UNIQUE',
  'ALTER TABLE',
  '複合キー',
  '自己参照',
  '多対多',
  'schema.table',
  '引用識別子',
  'PostgreSQL',
  'MySQL',
  'SQLite',
];
const track = byId<HTMLDivElement>('marquee-track');
function fillMarquee(): void {
  const make = (): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = 'marquee-item';
    span.textContent = SYNTAX.join('   ·   ');
    return span;
  };
  track.append(make(), make());
}
fillMarquee();

/* ---- ヘルプダイアログ ---- */
const help = byId<HTMLDialogElement>('help');
function openHelp(): void {
  if (typeof help.showModal === 'function' && !help.open) help.showModal();
}

/* ---- キーボードショートカット ---- */
document.addEventListener('keydown', (e) => {
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key === 'Enter') {
    e.preventDefault();
    fit();
    return;
  }
  if (meta && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    downloadBlob(new Blob([svgText], { type: 'image/svg+xml' }), 'erviz.svg');
    toast('SVGを保存しました');
    return;
  }
  // フォーカス中の図はキーボードでも操作できる
  if (document.activeElement === canvas) {
    const step = 48;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = pan[e.key];
    if (move !== undefined) {
      view.x += move[0];
      view.y += move[1];
      applyView();
      e.preventDefault();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      zoomBy(1.2);
      e.preventDefault();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      zoomBy(0.83);
      e.preventDefault();
      return;
    }
    if (e.key === '0') {
      fit();
      e.preventDefault();
      return;
    }
  }
  const typing = document.activeElement === ddl;
  if (typing) return;
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    openHelp();
  } else if (e.key === 'd' || e.key === 'D') {
    setDirection(direction === 'LR' ? 'TB' : 'LR');
  }
});

/* ---- 出現アニメーション ---- */
function setupMotion(): void {
  if (reduceMotion.matches) return;
  document.documentElement.classList.add('anim-ready');
  gsap.registerPlugin(ScrollTrigger);
  gsap.to('.hero-figure', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.05 });
  ScrollTrigger.batch('.reveal:not(.hero-figure)', {
    start: 'top 86%',
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out' }),
  });
}

/* ---- スクロールに応じてナビを強調 ---- */
function setupActiveNav(): void {
  const links = new Map<string, HTMLAnchorElement>();
  document.querySelectorAll<HTMLAnchorElement>('.nav a').forEach((a) => {
    const id = a.getAttribute('href')?.slice(1);
    if (id !== undefined) links.set(id, a);
  });
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          links.forEach((a) => a.classList.remove('active'));
          links.get(entry.target.id)?.classList.add('active');
        }
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  ['studio', 'examples', 'how'].forEach((id) => {
    const el = document.getElementById(id);
    if (el !== null) observer.observe(el);
  });
}

/* ---- 初期化 ---- */
function initialDdl(): string {
  const shared = readShareHash(location.hash);
  if (shared !== null && shared.trim() !== '') return shared;
  try {
    const saved = localStorage.getItem(DDL_KEY);
    if (saved !== null && saved.trim() !== '') return saved;
  } catch {
    /* 取得失敗は既定へ */
  }
  return defaultExample.ddl;
}

// ヒーローの作例(本物のレンダラで描く)
byId<HTMLDivElement>('hero-figure').innerHTML = ddlToSvg(
  examples.find((e) => e.id === 'blog')?.ddl ?? defaultExample.ddl,
);
byId<HTMLDivElement>('hero-figure').querySelector('svg')?.removeAttribute('width');
byId<HTMLDivElement>('hero-figure').querySelector('svg')?.removeAttribute('height');

const startDdl = initialDdl();
ddl.value = startDdl;
dirBtn.textContent = direction === 'LR' ? '縦並びにする' : '横並びにする';
dirBtn.setAttribute('aria-pressed', direction === 'TB' ? 'true' : 'false');
render(true);
window.addEventListener('resize', () => fit());
setupMotion();
setupActiveNav();

if (readShareHash(location.hash) !== null) {
  byId('studio').scrollIntoView({ behavior: 'auto' });
}
