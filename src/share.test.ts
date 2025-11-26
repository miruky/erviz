import { describe, expect, it } from 'vitest';
import { buildShareHash, decodeDdl, encodeDdl, readShareHash } from './share';

describe('encodeDdl / decodeDdl', () => {
  it('往復で元のDDLに戻る', () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY);';
    const token = encodeDdl(sql);
    expect(token).not.toBeNull();
    expect(decodeDdl(token as string)).toBe(sql);
  });

  it('日本語コメントを含むUTF-8を壊さない', () => {
    const sql = '-- 利用者テーブル\nCREATE TABLE 利用者 (識別子 INT PRIMARY KEY);';
    const token = encodeDdl(sql);
    expect(decodeDdl(token as string)).toBe(sql);
  });

  it('URLに使えない文字を含まない(base64url)', () => {
    const token = encodeDdl('CREATE TABLE t (a INT, b INT, c INT, d INT);');
    expect(token).toMatch(/^[A-Za-z0-9_-]*$/);
  });

  it('巨大すぎる入力は載せない', () => {
    expect(encodeDdl('x'.repeat(200000))).toBeNull();
  });

  it('壊れたトークンは null を返す', () => {
    expect(decodeDdl('@@@not-base64@@@')).toBeNull();
  });
});

describe('共有ハッシュ', () => {
  it('buildShareHash と readShareHash が往復する', () => {
    const sql = 'CREATE TABLE a (id INT PRIMARY KEY);';
    const hash = buildShareHash(sql);
    expect(hash).not.toBeNull();
    expect(readShareHash(hash as string)).toBe(sql);
  });

  it('先頭の#有無どちらでも読める', () => {
    const token = encodeDdl('CREATE TABLE t (id INT);');
    expect(readShareHash(`#s=${token}`)).toContain('CREATE TABLE');
    expect(readShareHash(`s=${token}`)).toContain('CREATE TABLE');
  });

  it('他のパラメータが混ざっても s を拾う', () => {
    const token = encodeDdl('CREATE TABLE t (id INT);');
    expect(readShareHash(`#view=studio&s=${token}`)).toContain('CREATE TABLE');
  });

  it('該当パラメータが無ければ null', () => {
    expect(readShareHash('#view=studio')).toBeNull();
    expect(readShareHash('')).toBeNull();
  });
});
