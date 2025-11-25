// SQL DDLを解析してテーブル定義とリレーションを取り出す。
// ER図の描画に必要な情報だけを読むトレラントなパーサで、
// 解釈できない文は警告に残して読み飛ばす。SQL全体の文法検証はしない。

export interface Column {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  foreignKey: boolean;
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface Relation {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  /** 参照元の列自体が一意(PKまたはUNIQUE)なら1対1 */
  one: boolean;
  /** 参照元の列がすべてNOT NULLなら必須参照 */
  mandatory: boolean;
}

export interface Schema {
  tables: Table[];
  relations: Relation[];
  warnings: string[];
}

type TokKind = 'word' | 'ident' | 'string' | 'number' | 'punct';

interface Tok {
  kind: TokKind;
  text: string;
  upper: string;
}

function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql.charAt(i);
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '-' && sql.charAt(i + 1) === '-') {
      while (i < n && sql.charAt(i) !== '\n') i += 1;
      continue;
    }
    if (c === '/' && sql.charAt(i + 1) === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      // 引用は同じ記号の2連で1文字にエスケープされる
      let j = i + 1;
      let text = '';
      while (j < n) {
        if (sql.charAt(j) === c && sql.charAt(j + 1) === c) {
          text += c;
          j += 2;
          continue;
        }
        if (sql.charAt(j) === c) break;
        text += sql.charAt(j);
        j += 1;
      }
      toks.push(
        c === "'"
          ? { kind: 'string', text, upper: '' }
          : { kind: 'ident', text, upper: text.toUpperCase() },
      );
      i = j + 1;
      continue;
    }
    if (c === '[') {
      const end = sql.indexOf(']', i + 1);
      const text = sql.slice(i + 1, end === -1 ? n : end);
      toks.push({ kind: 'ident', text, upper: text.toUpperCase() });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(sql.charAt(j))) j += 1;
      const text = sql.slice(i, j);
      toks.push({ kind: 'word', text, upper: text.toUpperCase() });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(sql.charAt(j))) j += 1;
      toks.push({ kind: 'number', text: sql.slice(i, j), upper: '' });
      i = j;
      continue;
    }
    toks.push({ kind: 'punct', text: c, upper: c });
    i += 1;
  }
  return toks;
}

function splitStatements(toks: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  for (const t of toks) {
    if (t.kind === 'punct' && t.text === ';') {
      if (cur.length > 0) out.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

const isWord = (t: Tok | undefined, upper: string): boolean =>
  t !== undefined && t.kind === 'word' && t.upper === upper;

const isPunct = (t: Tok | undefined, p: string): boolean =>
  t !== undefined && t.kind === 'punct' && t.text === p;

const isName = (t: Tok | undefined): t is Tok =>
  t !== undefined && (t.kind === 'word' || t.kind === 'ident');

/** `schema.table` のような修飾名を読み、最後の要素を返す */
function readQualifiedName(toks: Tok[], start: number): { name: string; next: number } | null {
  let i = start;
  let t = toks[i];
  if (!isName(t)) return null;
  let name = t.text;
  i += 1;
  while (isPunct(toks[i], '.')) {
    t = toks[i + 1];
    if (!isName(t)) break;
    name = t.text;
    i += 2;
  }
  return { name, next: i };
}

/** `( a, b, ... )` の列名リストを読む */
function readColumnList(toks: Tok[], start: number): { cols: string[]; next: number } | null {
  if (!isPunct(toks[start], '(')) return null;
  const cols: string[] = [];
  let i = start + 1;
  while (i < toks.length && !isPunct(toks[i], ')')) {
    const t = toks[i];
    if (isName(t)) cols.push(t.text);
    i += 1;
  }
  return { cols, next: i + 1 };
}

/** 括弧の対応をとって閉じ括弧の位置を返す */
function matchParen(toks: Tok[], open: number): number {
  let depth = 0;
  for (let i = open; i < toks.length; i += 1) {
    if (isPunct(toks[i], '(')) depth += 1;
    else if (isPunct(toks[i], ')')) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(toks: Tok[]): Tok[][] {
  const items: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (isPunct(t, '(')) depth += 1;
    if (isPunct(t, ')')) depth -= 1;
    if (depth === 0 && isPunct(t, ',')) {
      if (cur.length > 0) items.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length > 0) items.push(cur);
  return items;
}

interface PendingFk {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
}

interface PendingMark {
  table: string;
  cols: string[];
}

/** 列定義の型部分を読み終える位置を決めるキーワード */
const TYPE_STOP = new Set([
  'PRIMARY',
  'NOT',
  'NULL',
  'UNIQUE',
  'REFERENCES',
  'DEFAULT',
  'CHECK',
  'CONSTRAINT',
  'GENERATED',
  'AUTO_INCREMENT',
  'AUTOINCREMENT',
  'COLLATE',
  'COMMENT',
  'ON',
  'AS',
]);

function readType(toks: Tok[], start: number): { type: string; next: number } {
  let type = '';
  let i = start;
  while (i < toks.length) {
    const t = toks[i];
    if (t === undefined) break;
    if (t.kind === 'word' && TYPE_STOP.has(t.upper)) break;
    if (isPunct(t, '(')) {
      const close = matchParen(toks, i);
      const inner = toks.slice(i + 1, close === -1 ? toks.length : close);
      type += `(${inner.map((x) => x.text).join('')})`;
      i = close === -1 ? toks.length : close + 1;
      continue;
    }
    if (t.kind === 'punct') break;
    type += (type === '' ? '' : ' ') + t.text;
    i += 1;
  }
  return { type, next: i };
}

interface ParseCtx {
  tables: Table[];
  byName: Map<string, Table>;
  fks: PendingFk[];
  pks: PendingMark[];
  uniques: PendingMark[];
  warnings: string[];
}

function parseCreateTable(stmt: Tok[], ctx: ParseCtx): void {
  let i = 1;
  while (i < stmt.length && !isWord(stmt[i], 'TABLE')) i += 1;
  i += 1;
  if (isWord(stmt[i], 'IF')) i += 3; // IF NOT EXISTS
  const q = readQualifiedName(stmt, i);
  if (q === null) return;
  const tableName = q.name;
  i = q.next;
  if (!isPunct(stmt[i], '(')) {
    ctx.warnings.push(`CREATE TABLE ${tableName} に列定義の括弧が見つかりません`);
    return;
  }
  const close = matchParen(stmt, i);
  const body = stmt.slice(i + 1, close === -1 ? stmt.length : close);

  if (ctx.byName.has(tableName.toLowerCase())) {
    ctx.warnings.push(`テーブル ${tableName} が重複定義されています(最初の定義を使用)`);
    return;
  }
  const table: Table = { name: tableName, columns: [] };
  ctx.tables.push(table);
  ctx.byName.set(tableName.toLowerCase(), table);

  for (const item of splitTopLevel(body)) {
    parseTableEntry(item, table, ctx);
  }
}

function parseTableEntry(item: Tok[], table: Table, ctx: ParseCtx): void {
  let i = 0;
  let head = item[i];
  if (head === undefined) return;

  if (head.kind === 'word' && head.upper === 'CONSTRAINT') {
    i += 2; // CONSTRAINT 名前 を飛ばす
    head = item[i];
    if (head === undefined) return;
  }

  if (head.kind === 'word') {
    switch (head.upper) {
      case 'PRIMARY': {
        const list = readColumnList(item, i + 2);
        if (list !== null) ctx.pks.push({ table: table.name, cols: list.cols });
        return;
      }
      case 'UNIQUE': {
        let j = i + 1;
        if (isWord(item[j], 'KEY') || isWord(item[j], 'INDEX')) j += 1;
        if (isName(item[j]) && !isPunct(item[j + 1], '.')) j += 1; // インデックス名
        const list = readColumnList(item, j);
        if (list !== null) ctx.uniques.push({ table: table.name, cols: list.cols });
        return;
      }
      case 'FOREIGN': {
        const list = readColumnList(item, i + 2);
        if (list === null) return;
        let j = list.next;
        if (!isWord(item[j], 'REFERENCES')) return;
        const ref = readQualifiedName(item, j + 1);
        if (ref === null) return;
        j = ref.next;
        const refCols = readColumnList(item, j);
        ctx.fks.push({
          fromTable: table.name,
          fromColumns: list.cols,
          toTable: ref.name,
          toColumns: refCols === null ? [] : refCols.cols,
        });
        return;
      }
      case 'KEY':
      case 'INDEX':
      case 'FULLTEXT':
      case 'SPATIAL':
      case 'CHECK':
      case 'EXCLUDE':
      case 'LIKE':
        return;
      default:
        break;
    }
  }

  if (!isName(head)) return;
  const col: Column = {
    name: head.text,
    type: '',
    primaryKey: false,
    notNull: false,
    unique: false,
    foreignKey: false,
  };
  const typed = readType(item, i + 1);
  col.type = typed.type;

  for (let j = typed.next; j < item.length; j += 1) {
    const t = item[j];
    if (t === undefined || t.kind !== 'word') continue;
    if (t.upper === 'PRIMARY' && isWord(item[j + 1], 'KEY')) {
      col.primaryKey = true;
      j += 1;
    } else if (t.upper === 'NOT' && isWord(item[j + 1], 'NULL')) {
      col.notNull = true;
      j += 1;
    } else if (t.upper === 'UNIQUE') {
      col.unique = true;
    } else if (t.upper === 'REFERENCES') {
      const ref = readQualifiedName(item, j + 1);
      if (ref === null) continue;
      const refCols = readColumnList(item, ref.next);
      ctx.fks.push({
        fromTable: table.name,
        fromColumns: [col.name],
        toTable: ref.name,
        toColumns: refCols === null ? [] : refCols.cols,
      });
      j = (refCols === null ? ref.next : refCols.next) - 1;
    }
  }
  table.columns.push(col);
}

function parseAlterTable(stmt: Tok[], ctx: ParseCtx): void {
  let i = 2;
  if (isWord(stmt[i], 'ONLY')) i += 1;
  const q = readQualifiedName(stmt, i);
  if (q === null) return;
  const tableName = q.name;

  // ADD CONSTRAINT 系をまとめて拾う(1文に複数あってもよい)
  for (let j = q.next; j < stmt.length; j += 1) {
    const t = stmt[j];
    if (t === undefined || t.kind !== 'word') continue;
    if (t.upper === 'PRIMARY' && isWord(stmt[j + 1], 'KEY')) {
      const list = readColumnList(stmt, j + 2);
      if (list !== null) {
        ctx.pks.push({ table: tableName, cols: list.cols });
        j = list.next - 1;
      }
    } else if (t.upper === 'UNIQUE') {
      const list = readColumnList(stmt, j + 1);
      if (list !== null) {
        ctx.uniques.push({ table: tableName, cols: list.cols });
        j = list.next - 1;
      }
    } else if (t.upper === 'FOREIGN' && isWord(stmt[j + 1], 'KEY')) {
      const list = readColumnList(stmt, j + 2);
      if (list === null) continue;
      let k = list.next;
      if (!isWord(stmt[k], 'REFERENCES')) continue;
      const ref = readQualifiedName(stmt, k + 1);
      if (ref === null) continue;
      k = ref.next;
      const refCols = readColumnList(stmt, k);
      ctx.fks.push({
        fromTable: tableName,
        fromColumns: list.cols,
        toTable: ref.name,
        toColumns: refCols === null ? [] : refCols.cols,
      });
      j = (refCols === null ? k : refCols.next) - 1;
    }
  }
}

function findColumn(table: Table, name: string): Column | undefined {
  const lower = name.toLowerCase();
  return table.columns.find((c) => c.name.toLowerCase() === lower);
}

export function parseSchema(sql: string): Schema {
  const ctx: ParseCtx = {
    tables: [],
    byName: new Map(),
    fks: [],
    pks: [],
    uniques: [],
    warnings: [],
  };

  for (const stmt of splitStatements(tokenize(sql))) {
    const head = stmt[0];
    if (head === undefined || head.kind !== 'word') continue;
    if (head.upper === 'CREATE') {
      const hasTable = stmt.some((t, i) => i <= 3 && isWord(t, 'TABLE'));
      if (hasTable) parseCreateTable(stmt, ctx);
    } else if (head.upper === 'ALTER' && isWord(stmt[1], 'TABLE')) {
      parseAlterTable(stmt, ctx);
    }
  }

  for (const pk of ctx.pks) {
    const table = ctx.byName.get(pk.table.toLowerCase());
    if (table === undefined) continue;
    for (const c of pk.cols) {
      const col = findColumn(table, c);
      if (col !== undefined) col.primaryKey = true;
    }
  }
  for (const u of ctx.uniques) {
    const table = ctx.byName.get(u.table.toLowerCase());
    if (table === undefined || u.cols.length !== 1) continue;
    const col = findColumn(table, u.cols[0] ?? '');
    if (col !== undefined) col.unique = true;
  }

  const relations: Relation[] = [];
  const seen = new Set<string>();
  for (const fk of ctx.fks) {
    const from = ctx.byName.get(fk.fromTable.toLowerCase());
    const to = ctx.byName.get(fk.toTable.toLowerCase());
    if (from === undefined) continue;
    if (to === undefined) {
      ctx.warnings.push(
        `${fk.fromTable} が参照するテーブル ${fk.toTable} が見つからないため、この参照は描画しません`,
      );
      continue;
    }
    const toColumns =
      fk.toColumns.length > 0
        ? fk.toColumns
        : to.columns.filter((c) => c.primaryKey).map((c) => c.name);

    const fromCols = fk.fromColumns
      .map((c) => findColumn(from, c))
      .filter((c): c is Column => c !== undefined);
    for (const c of fromCols) c.foreignKey = true;

    const pkSet = from.columns.filter((c) => c.primaryKey).map((c) => c.name.toLowerCase());
    const fkSet = fk.fromColumns.map((c) => c.toLowerCase());
    const matchesPk =
      pkSet.length > 0 && pkSet.length === fkSet.length && fkSet.every((c) => pkSet.includes(c));
    const singleUnique = fromCols.length === 1 && fromCols.every((c) => c.unique);
    const one = matchesPk || singleUnique;
    const mandatory =
      fromCols.length === fk.fromColumns.length && fromCols.every((c) => c.notNull || c.primaryKey);

    const key = [
      from.name.toLowerCase(),
      fkSet.join('+'),
      to.name.toLowerCase(),
      toColumns.map((c) => c.toLowerCase()).join('+'),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    relations.push({
      fromTable: from.name,
      fromColumns: fk.fromColumns,
      toTable: to.name,
      toColumns,
      one,
      mandatory,
    });
  }

  return { tables: ctx.tables, relations, warnings: ctx.warnings };
}
