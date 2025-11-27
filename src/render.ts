// レイアウト済みスキーマをSVG文字列にする。
// 出力は単体のファイルとして配布でき、prefers-color-schemeで
// ライト・ダークの両テーマに追従する。リレーションはクロウズフット記法。

import type { Relation, Schema, Table } from './parse';
import { HEADER_H, ROW_H, typeLabel, type Box, type Layout } from './layout';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (m) => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return '&quot;';
  });
}

const STYLE = `
#er {
  --er-ink: #232a2e;
  --er-muted: #6b7680;
  --er-line: #8e99a3;
  --er-panel: #fbf9f3;
  --er-frame: #d9d2c4;
  --er-hd: #efe9dc;
  --er-accent: #0d7d70;
  color: var(--er-ink);
  font-family: ui-sans-serif, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
}
@media (prefers-color-scheme: dark) {
  #er {
    --er-ink: #e7e3d8;
    --er-muted: #97a1aa;
    --er-line: #717d87;
    --er-panel: #1d2226;
    --er-frame: #38424a;
    --er-hd: #262f34;
    --er-accent: #4fbcac;
  }
}
#er .tbl .frame { fill: var(--er-panel); stroke: var(--er-frame); stroke-width: 1.25; transition: stroke .15s ease; }
#er .tbl .hd { fill: var(--er-hd); }
#er .tbl .tname { font-size: 14px; font-weight: 700; fill: var(--er-ink); }
#er .tbl .cname { font-size: 13px; fill: var(--er-ink); }
#er .tbl .ctype { font-size: 12px; fill: var(--er-muted); }
#er .tbl .ic { stroke: var(--er-accent); stroke-width: 1.5; fill: none; }
#er .tbl:hover .frame { stroke: var(--er-accent); }
#er .edge .line { stroke: var(--er-line); stroke-width: 1.5; fill: none; transition: stroke .15s ease; }
#er .edge .mark { stroke: var(--er-line); stroke-width: 1.5; fill: none; transition: stroke .15s ease; }
#er .edge .hit { stroke: transparent; stroke-width: 14; fill: none; }
#er .edge:hover .line, #er .edge:hover .mark { stroke: var(--er-accent); }
#er .empty { font-size: 14px; fill: var(--er-muted); }
`;

interface Vec {
  ox: number;
  oy: number;
  px: number;
  py: number;
}

function keyIcon(x: number, y: number): string {
  return (
    `<g class="ic" aria-hidden="true">` +
    `<circle cx="${x - 1.5}" cy="${y}" r="2.8"/>` +
    `<path d="M${x + 1.3} ${y}h6m-2.4 0v3.2"/>` +
    `</g>`
  );
}

function linkIcon(x: number, y: number): string {
  return (
    `<g class="ic" aria-hidden="true">` +
    `<rect x="${x - 5}" y="${y - 3}" width="7" height="6" rx="3"/>` +
    `<rect x="${x + 1}" y="${y - 3}" width="7" height="6" rx="3"/>` +
    `</g>`
  );
}

function tableSvg(box: Box): string {
  const t = box.table;
  const w = box.width;
  const parts: string[] = [];
  parts.push(
    `<g class="tbl" data-table="${esc(t.name)}" transform="translate(${box.x},${box.y})">`,
  );
  parts.push(`<title>${esc(t.name)}</title>`);
  parts.push(`<rect class="frame" width="${w}" height="${box.height}" rx="9"/>`);
  parts.push(
    `<path class="hd" d="M0 ${HEADER_H}V9a9 9 0 0 1 9-9h${w - 18}a9 9 0 0 1 9 9v${HEADER_H - 9}z"/>`,
  );
  parts.push(
    `<text class="tname" x="${w / 2}" y="${HEADER_H / 2 + 5}" text-anchor="middle">${esc(t.name)}</text>`,
  );
  t.columns.forEach((c, i) => {
    const top = HEADER_H + i * ROW_H;
    const mid = top + ROW_H / 2;
    if (c.primaryKey) parts.push(keyIcon(11, mid));
    else if (c.foreignKey) parts.push(linkIcon(11, mid));
    parts.push(`<text class="cname" x="22" y="${mid + 4.5}">${esc(c.name)}</text>`);
    parts.push(
      `<text class="ctype" x="${w - 10}" y="${mid + 4.5}" text-anchor="end">${esc(typeLabel(c))}</text>`,
    );
  });
  parts.push('</g>');
  return parts.join('');
}

function rowY(box: Box, table: Table, colName: string | undefined): number {
  if (colName !== undefined) {
    const lower = colName.toLowerCase();
    const i = table.columns.findIndex((c) => c.name.toLowerCase() === lower);
    if (i >= 0) return box.y + HEADER_H + i * ROW_H + ROW_H / 2;
  }
  return box.y + HEADER_H / 2;
}

/** 多側の端点(クロウズフット)。v は外向き・直交の単位ベクトル */
function manyMark(x: number, y: number, v: Vec, mandatory: boolean): string {
  const tx = x + v.ox * 13;
  const ty = y + v.oy * 13;
  const foot =
    `M${x + v.px * 5} ${y + v.py * 5}L${tx} ${ty}` + `M${x - v.px * 5} ${y - v.py * 5}L${tx} ${ty}`;
  const opt = mandatory
    ? `M${x + v.ox * 17 + v.px * 5} ${y + v.oy * 17 + v.py * 5}` +
      `L${x + v.ox * 17 - v.px * 5} ${y + v.oy * 17 - v.py * 5}`
    : `M${x + v.ox * 20 + 3.2} ${y + v.oy * 20}a3.2 3.2 0 1 0 -6.4 0a3.2 3.2 0 1 0 6.4 0`;
  return `<path class="mark" d="${foot}${opt}"/>`;
}

/** 1側の端点(直交バー) */
function oneMark(x: number, y: number, v: Vec): string {
  const cx = x + v.ox * 11;
  const cy = y + v.oy * 11;
  return `<path class="mark" d="M${cx + v.px * 5} ${cy + v.py * 5}L${cx - v.px * 5} ${cy - v.py * 5}"/>`;
}

const HX = (dir: number): Vec => ({ ox: dir, oy: 0, px: 0, py: 1 });
const VY = (dir: number): Vec => ({ ox: 0, oy: dir, px: 1, py: 0 });

interface Endpoints {
  d: string;
  x1: number;
  y1: number;
  v1: Vec;
  x2: number;
  y2: number;
  v2: Vec;
}

function routeLR(rel: Relation, from: Box, to: Box): Endpoints {
  const y1 = rowY(from, from.table, rel.fromColumns[0]);
  let y2 = rowY(to, to.table, rel.toColumns[0]);
  if (from.x + from.width + 24 <= to.x) {
    const x1 = from.x + from.width;
    const x2 = to.x;
    const mx = Math.round((x1 + x2) / 2);
    return { d: `M${x1} ${y1}H${mx}V${y2}H${x2}`, x1, y1, v1: HX(1), x2, y2, v2: HX(-1) };
  }
  if (to.x + to.width + 24 <= from.x) {
    const x1 = from.x;
    const x2 = to.x + to.width;
    const mx = Math.round((x1 + x2) / 2);
    return { d: `M${x1} ${y1}H${mx}V${y2}H${x2}`, x1, y1, v1: HX(-1), x2, y2, v2: HX(1) };
  }
  // 同じ列・自己参照は右側に迂回する
  const x1 = from.x + from.width;
  const x2 = to.x + to.width;
  if (from === to && y1 === y2) y2 = y1 + ROW_H / 2 > from.y + from.height ? y1 - 10 : y1 + 10;
  const out = Math.max(x1, x2) + 44;
  return { d: `M${x1} ${y1}H${out}V${y2}H${x2}`, x1, y1, v1: HX(1), x2, y2, v2: HX(1) };
}

function routeTB(from: Box, to: Box): Endpoints {
  const cxFrom = from.x + from.width / 2;
  const cxTo = to.x + to.width / 2;
  if (to.y + to.height + 24 <= from.y) {
    const y1 = from.y;
    const y2 = to.y + to.height;
    const my = Math.round((y1 + y2) / 2);
    return {
      d: `M${cxFrom} ${y1}V${my}H${cxTo}V${y2}`,
      x1: cxFrom,
      y1,
      v1: VY(-1),
      x2: cxTo,
      y2,
      v2: VY(1),
    };
  }
  if (from.y + from.height + 24 <= to.y) {
    const y1 = from.y + from.height;
    const y2 = to.y;
    const my = Math.round((y1 + y2) / 2);
    return {
      d: `M${cxFrom} ${y1}V${my}H${cxTo}V${y2}`,
      x1: cxFrom,
      y1,
      v1: VY(1),
      x2: cxTo,
      y2,
      v2: VY(-1),
    };
  }
  // 同層・自己参照は下側に迂回する
  const y1 = from.y + from.height;
  let y2 = to.y + to.height;
  if (from === to) y2 = to.y;
  const out = Math.max(y1, y2) + 44;
  const x2 = from === to ? cxTo + 18 : cxTo;
  return {
    d: `M${cxFrom} ${y1}V${out}H${x2}V${y2}`,
    x1: cxFrom,
    y1,
    v1: VY(1),
    x2,
    y2,
    v2: from === to ? VY(-1) : VY(1),
  };
}

function edgeSvg(rel: Relation, from: Box, to: Box, dir: Layout['direction']): string {
  const e = dir === 'TB' ? routeTB(from, to) : routeLR(rel, from, to);
  const label = `${rel.fromTable}.${rel.fromColumns.join(',')} から ${rel.toTable}.${rel.toColumns.join(',')} への参照`;
  return (
    `<g class="edge" data-from="${esc(rel.fromTable)}" data-to="${esc(rel.toTable)}"><title>${esc(label)}</title>` +
    `<path class="hit" d="${e.d}"/>` +
    `<path class="line" d="${e.d}"/>` +
    (rel.one ? oneMark(e.x1, e.y1, e.v1) : manyMark(e.x1, e.y1, e.v1, rel.mandatory)) +
    oneMark(e.x2, e.y2, e.v2) +
    '</g>'
  );
}

export function renderSvg(layout: Layout, schema: Schema): string {
  if (layout.boxes.length === 0) {
    return (
      `<svg id="er" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" role="img" aria-label="ER図(テーブルなし)">` +
      `<title>ER図(テーブルなし)</title><style>${STYLE}</style>` +
      `<text class="empty" x="240" y="84" text-anchor="middle">CREATE TABLE文が見つかりません</text></svg>`
    );
  }

  const byName = new Map<string, Box>();
  for (const b of layout.boxes) byName.set(b.table.name.toLowerCase(), b);

  const edges: string[] = [];
  for (const rel of schema.relations) {
    const from = byName.get(rel.fromTable.toLowerCase());
    const to = byName.get(rel.toTable.toLowerCase());
    if (from === undefined || to === undefined) continue;
    edges.push(edgeSvg(rel, from, to, layout.direction));
  }

  const tables = layout.boxes.map((b) => tableSvg(b));
  const label = `ER図: ${layout.boxes.length}テーブル、${edges.length}リレーション`;
  return (
    `<svg id="er" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${esc(label)}">` +
    `<title>${esc(label)}</title><style>${STYLE}</style>` +
    edges.join('') +
    tables.join('') +
    '</svg>'
  );
}
