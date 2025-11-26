import { describe, expect, it } from 'vitest';
import { defaultExample, exampleById, examples } from './examples';
import { parseSchema } from './parse';

describe('examples', () => {
  it('すべてのサンプルが一意なidを持つ', () => {
    const ids = examples.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('どのサンプルも複数テーブルとリレーションを含み警告が出ない', () => {
    for (const ex of examples) {
      const schema = parseSchema(ex.ddl);
      expect(schema.tables.length, ex.id).toBeGreaterThanOrEqual(3);
      expect(schema.relations.length, ex.id).toBeGreaterThan(0);
      expect(schema.warnings, ex.id).toEqual([]);
    }
  });

  it('exampleById は既知idを引き、未知は undefined', () => {
    expect(exampleById('blog')?.name).toBe('ブログ / CMS');
    expect(exampleById('missing')).toBeUndefined();
  });

  it('defaultExample は一覧の先頭', () => {
    expect(defaultExample.id).toBe(examples[0]?.id);
  });
});
