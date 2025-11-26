// スキーマをFK依存に基づいて層状に自動配置する。
// 参照される側を上流(横向きなら左、縦向きなら上)に置き、
// 同じ入力からは常に同じ配置を作る。

import type { Column, Schema, Table } from './parse';

export const HEADER_H = 36;
export const ROW_H = 26;
export const MARGIN = 28;
const H_GAP = 96;
const V_GAP = 44;
const MIN_W = 168;

export type Direction = 'LR' | 'TB';

export interface LayoutOptions {
  /** LR: 参照先を左に並べる(既定)。TB: 参照先を上に並べる */
  direction?: Direction;
}

export interface Box {
  table: Table;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  boxes: Box[];
  width: number;
  height: number;
  direction: Direction;
}

/** 列の型表示。NULL許容には ? を後置する */
export function typeLabel(c: Column): string {
  const nullable = !c.notNull && !c.primaryKey;
  return c.type + (nullable && c.type !== '' ? '?' : '');
}

// 実DOMなしで使えるよう、文字幅はフォントメトリクスの近似で見積もる
function textW(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code < 0x100 ? px * 0.62 : px;
  }
  return w;
}

function boxWidth(t: Table): number {
  let w = textW(t.name, 14) + 40;
  for (const c of t.columns) {
    w = Math.max(w, 22 + textW(c.name, 13) + 30 + textW(typeLabel(c), 12) + 12);
  }
  return Math.max(MIN_W, Math.ceil(w));
}

function boxHeight(t: Table): number {
  return HEADER_H + t.columns.length * ROW_H + (t.columns.length > 0 ? 8 : 10);
}

/** FK依存を層番号(参照先からの最長距離)に変換する。循環は0層に倒す */
function assignLayers(tables: Table[], parents: number[][]): number[] {
  const layer = new Array<number>(tables.length).fill(-1);
  const inStack = new Array<boolean>(tables.length).fill(false);
  const layerOf = (v: number): number => {
    const memo = layer[v];
    if (memo !== undefined && memo >= 0) return memo;
    if (inStack[v] === true) return 0;
    inStack[v] = true;
    let l = 0;
    for (const p of parents[v] ?? []) l = Math.max(l, layerOf(p) + 1);
    inStack[v] = false;
    layer[v] = l;
    return l;
  };
  tables.forEach((_, v) => layerOf(v));
  return layer;
}

/** 親の重心に寄せて層内の順序を整え、線の交差を減らす(1パスのバリセンタ) */
function orderGroups(groups: number[][], parents: number[][]): void {
  const posInGroup = new Map<number, number>();
  groups.forEach((g) => g.forEach((v, i) => posInGroup.set(v, i)));
  for (let k = 1; k < groups.length; k += 1) {
    const g = groups[k];
    if (g === undefined) continue;
    const score = (v: number): number => {
      const ps = parents[v] ?? [];
      if (ps.length === 0) return posInGroup.get(v) ?? 0;
      let sum = 0;
      for (const p of ps) sum += posInGroup.get(p) ?? 0;
      return sum / ps.length;
    };
    g.sort((a, b) => score(a) - score(b) || (posInGroup.get(a) ?? 0) - (posInGroup.get(b) ?? 0));
    g.forEach((v, i) => posInGroup.set(v, i));
  }
}

export function layoutSchema(schema: Schema, opts: LayoutOptions = {}): Layout {
  const direction: Direction = opts.direction ?? 'LR';
  const tables = schema.tables;
  if (tables.length === 0) return { boxes: [], width: 0, height: 0, direction };

  const indexOf = new Map<string, number>();
  tables.forEach((t, i) => indexOf.set(t.name.toLowerCase(), i));

  const parents: number[][] = tables.map(() => []);
  for (const r of schema.relations) {
    const from = indexOf.get(r.fromTable.toLowerCase());
    const to = indexOf.get(r.toTable.toLowerCase());
    if (from === undefined || to === undefined || from === to) continue;
    const list = parents[from];
    if (list !== undefined && !list.includes(to)) list.push(to);
  }

  const layer = assignLayers(tables, parents);
  const maxLayer = Math.max(...layer.map((l) => Math.max(l, 0)));
  const groups: number[][] = [];
  for (let k = 0; k <= maxLayer; k += 1) groups.push([]);
  tables.forEach((_, v) => groups[Math.max(layer[v] ?? 0, 0)]?.push(v));
  orderGroups(groups, parents);

  const widths = tables.map((t) => boxWidth(t));
  const heights = tables.map((t) => boxHeight(t));
  const boxes: Box[] = new Array<Box>(tables.length);

  if (direction === 'TB') {
    // 層を縦に積み、層内は横に並べる
    const rowHeights = groups.map((g) => Math.max(...g.map((v) => heights[v] ?? 0), HEADER_H));
    const rowWidths = groups.map((g) =>
      g.reduce((acc, v) => acc + (widths[v] ?? MIN_W), Math.max(g.length - 1, 0) * H_GAP),
    );
    const widest = Math.max(...rowWidths, 0);
    let y = MARGIN;
    groups.forEach((g, k) => {
      let x = MARGIN + (widest - (rowWidths[k] ?? 0)) / 2;
      for (const v of g) {
        const table = tables[v];
        if (table === undefined) continue;
        boxes[v] = {
          table,
          x: Math.round(x),
          y: Math.round(y),
          width: widths[v] ?? MIN_W,
          height: heights[v] ?? HEADER_H,
        };
        x += (widths[v] ?? MIN_W) + H_GAP;
      }
      y += (rowHeights[k] ?? HEADER_H) + V_GAP;
    });
    const width = widest + MARGIN * 2;
    const height = y - V_GAP + MARGIN;
    return { boxes: boxes.filter((b): b is Box => b !== undefined), width, height, direction };
  }

  // LR: 層を横に並べ、層内は縦に積む
  const colWidths = groups.map((g) => Math.max(...g.map((v) => widths[v] ?? MIN_W), MIN_W));
  const colHeights = groups.map((g) =>
    g.reduce((acc, v) => acc + (heights[v] ?? 0), Math.max(g.length - 1, 0) * V_GAP),
  );
  const tallest = Math.max(...colHeights, 0);
  let x = MARGIN;
  groups.forEach((g, k) => {
    let y = MARGIN + (tallest - (colHeights[k] ?? 0)) / 2;
    for (const v of g) {
      const table = tables[v];
      if (table === undefined) continue;
      boxes[v] = {
        table,
        x: Math.round(x),
        y: Math.round(y),
        width: widths[v] ?? MIN_W,
        height: heights[v] ?? HEADER_H,
      };
      y += (heights[v] ?? 0) + V_GAP;
    }
    x += (colWidths[k] ?? MIN_W) + H_GAP;
  });
  const width = x - H_GAP + MARGIN;
  const height = tallest + MARGIN * 2;
  return { boxes: boxes.filter((b): b is Box => b !== undefined), width, height, direction };
}
