import { describe, expect, it } from 'vitest';
import { parseSchema } from './parse';
import { layoutSchema } from './layout';
import { renderSvg } from './render';
import { ddlToSvg } from './index';
import { sampleDdl } from './sample';

function svgFor(sql: string): string {
  const schema = parseSchema(sql);
  return renderSvg(layoutSchema(schema), schema);
}

describe('renderSvg', () => {
  it('viewBoxとtitleを持つスケーラブルなSVGを返す', () => {
    const svg = svgFor('CREATE TABLE users (id INT PRIMARY KEY);');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 ');
    expect(svg).toContain('<title>');
    expect(svg).toContain('role="img"');
    expect(svg).not.toMatch(/<svg [^>]*width=/);
  });

  it('ライト・ダーク両テーマのスタイルを埋め込む', () => {
    const svg = svgFor('CREATE TABLE t (id INT);');
    expect(svg).toContain('prefers-color-scheme: dark');
    expect(svg).toContain('--er-ink');
  });

  it('テーブル名と列名・型を描画する', () => {
    const svg = svgFor(`CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email VARCHAR(255) NOT NULL
    );`);
    expect(svg).toContain('>users</text>');
    expect(svg).toContain('>id</text>');
    expect(svg).toContain('>INTEGER</text>');
    expect(svg).toContain('>VARCHAR(255)</text>');
  });

  it('NULL許容の型には?を後置する', () => {
    const svg = svgFor('CREATE TABLE t (id INT PRIMARY KEY, memo TEXT);');
    expect(svg).toContain('>TEXT?</text>');
    expect(svg).toContain('>INT</text>');
  });

  it('リレーション1本につきedgeグループを1つ描く', () => {
    const svg = svgFor(`
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE orders (id INT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id));
      CREATE TABLE notes (id INT PRIMARY KEY, user_id INT REFERENCES users(id));
    `);
    expect(svg.match(/class="edge"/g)).toHaveLength(2);
  });

  it('特殊文字をエスケープする', () => {
    const svg = svgFor('CREATE TABLE "a<b" (id INT PRIMARY KEY, "x&y" INT);');
    expect(svg).toContain('a&lt;b');
    expect(svg).toContain('x&amp;y');
    expect(svg).not.toContain('a<b</text>');
  });

  it('自己参照でも壊れないSVGを返す', () => {
    const svg = svgFor(
      'CREATE TABLE tree (id INT PRIMARY KEY, parent_id INT REFERENCES tree(id));',
    );
    expect(svg).toContain('class="edge"');
    expect(svg).toContain('</svg>');
  });

  it('テーブルが無い場合は空状態のSVGを返す', () => {
    const svg = svgFor('SELECT 1;');
    expect(svg).toContain('CREATE TABLE文が見つかりません');
    expect(svg).toContain('viewBox');
  });
});

describe('ddlToSvg', () => {
  it('サンプルDDL全体を1回で描画できる', () => {
    const svg = ddlToSvg(sampleDdl);
    expect(svg).toContain('>order_items</text>');
    expect(svg).toContain('>reviews</text>');
    expect(svg.match(/class="edge"/g)?.length).toBe(8);
  });
});
