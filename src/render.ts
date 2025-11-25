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
  --er-ink: #28323a;
  --er-muted: #6b7680;
  --er-line: #8e99a3;
  --er-panel: #ffffff;
  --er-frame: #c3ccd4;
  --er-hd: #eef3f2;
  --er-accent: #0e7f74;
  color: var(--er-ink);
  font-family: ui-sans-serif, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
}
@media (prefers-color-scheme: dark) {
  #er {
    --er-ink: #dde3e8;
    --er-muted: #95a1ab;
    --er-line: #717d87;
    --er-panel: #20262b;
    --er-frame: #3a444c;
    --er-hd: #283439;
    --er-accent: #4fb8a8;
  }
}
#er .tbl .frame { fill: var(--er-panel); stroke: var(--er-frame); stroke-width: 1.25; }
#er .tbl .hd { fill: var(--er-hd); }
#er .tbl .tname { font-size: 14px; font-weight: 700; fill: var(--er-ink); }
#er .tbl .cname { font-size: 13px; fill: var(--er-ink); }
#er .tbl .ctype { font-size: 12px; fill: var(--er-muted); }
#er .tbl .ic { stroke: var(--er-accent); stroke-width: 1.5; fill: none; }
#er .edge .line { stroke: var(--er-line); stroke-width: 1.5; fill: none; }
#er .edge .mark { stroke: var(--er-line); stroke-width: 1.5; fill: none; }
#er .edge .hit { stroke: transparent; stroke-width: 14; fill: none; }
#er .edge:hover .line, #er .edge:hover .mark { stroke: var(--er-accent); }
#er .empty { font-size: 14px; fill: var(--er-muted); }
`;

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
  parts.push(`<g class="tbl" transform="translate(${box.x},${box.y})">`);
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

/** 多側の端点。dir はボックスから外へ向かう向き(+1: 右、-1: 左) */
function manyMark(x: number, y: number, dir: number, mandatory: boolean): string {
  const tip = x + 13 * dir;
  const foot = `M${x} ${y - 5}L${tip} ${y}M${x} ${y + 5}L${tip} ${y}`;
  const opt = mandatory
    ? `M${x + 17 * dir} ${y - 5}v10`
    : `M${x + 20 * dir} ${y}a3.2 3.2 0 1 0 ${-6.4 * dir} 0a3.2 3.2 0 1 0 ${6.4 * dir} 0`;
  return `<path class="mark" d="${foot}${opt}"/>`;
}

/** 1側の端点(垂直バー) */
function oneMark(x: number, y: number, dir: number): string {
  return `<path class="mark" d="M${x + 11 * dir} ${y - 5}v10"/>`;
}

function edgeSvg(rel: Relation, from: Box, to: Box): string {
  const y1 = rowY(from, from.table, rel.fromColumns[0]);
  let y2 = rowY(to, to.table, rel.toColumns[0]);
  let d: string;
  let dir1: number;
  let dir2: number;
  let x1: number;
  let x2: number;

  if (from.x + from.width + 24 <= to.x) {
    x1 = from.x + from.width;
    x2 = to.x;
    dir1 = 1;
    dir2 = -1;
    const mx = Math.round((x1 + x2) / 2);
    d = `M${x1} ${y1}H${mx}V${y2}H${x2}`;
  } else if (to.x + to.width + 24 <= from.x) {
    x1 = from.x;
    x2 = to.x + to.width;
    dir1 = -1;
    dir2 = 1;
    const mx = Math.round((x1 + x2) / 2);
    d = `M${x1} ${y1}H${mx}V${y2}H${x2}`;
  } else {
    // 同じ列・自己参照は右側に迂回する
    x1 = from.x + from.width;
    x2 = to.x + to.width;
    dir1 = 1;
    dir2 = 1;
    if (from === to && y1 === y2) y2 = y1 + ROW_H / 2 > from.y + from.height ? y1 - 10 : y1 + 10;
    const out = Math.max(x1, x2) + 44;
    d = `M${x1} ${y1}H${out}V${y2}H${x2}`;
  }

  const label = `${rel.fromTable}.${rel.fromColumns.join(',')} から ${rel.toTable}.${rel.toColumns.join(',')} への参照`;
  return (
    `<g class="edge"><title>${esc(label)}</title>` +
    `<path class="hit" d="${d}"/>` +
    `<path class="line" d="${d}"/>` +
    (rel.one ? oneMark(x1, y1, dir1) : manyMark(x1, y1, dir1, rel.mandatory)) +
    oneMark(x2, y2, dir2) +
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
    edges.push(edgeSvg(rel, from, to));
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
