import { describe, expect, it } from 'vitest';
import { parseSchema } from './parse';

describe('parseSchema: 列定義', () => {
  it('列名・型・制約フラグを読み取る', () => {
    const s = parseSchema(`CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      bio TEXT
    );`);
    expect(s.tables).toHaveLength(1);
    const t = s.tables[0];
    expect(t?.name).toBe('users');
    expect(t?.columns.map((c) => c.name)).toEqual(['id', 'email', 'bio']);
    expect(t?.columns[0]).toMatchObject({ type: 'INTEGER', primaryKey: true });
    expect(t?.columns[1]).toMatchObject({ type: 'VARCHAR(255)', notNull: true, unique: true });
    expect(t?.columns[2]).toMatchObject({ primaryKey: false, notNull: false });
  });

  it('複数語の型とDEFAULT式を壊さず読む', () => {
    const s = parseSchema(`CREATE TABLE logs (
      at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      amount NUMERIC(10,2) DEFAULT 0
    );`);
    const cols = s.tables[0]?.columns;
    expect(cols?.[0]?.type).toBe('TIMESTAMP WITH TIME ZONE');
    expect(cols?.[0]?.notNull).toBe(true);
    expect(cols?.[1]?.type).toBe('NUMERIC(10,2)');
  });

  it('引用識別子(backtick・二重引用符・角括弧・スキーマ修飾)を扱う', () => {
    const s = parseSchema(`
      CREATE TABLE \`user accounts\` (id INT PRIMARY KEY);
      CREATE TABLE "Orders" ([order id] INT PRIMARY KEY);
      CREATE TABLE public.items (id INT PRIMARY KEY);
    `);
    expect(s.tables.map((t) => t.name)).toEqual(['user accounts', 'Orders', 'items']);
    expect(s.tables[1]?.columns[0]?.name).toBe('order id');
  });

  it('コメントと文字列リテラル内の記号に惑わされない', () => {
    const s = parseSchema(`
      -- これはコメント CREATE TABLE ghost (x INT);
      /* ブロック
         コメント */
      CREATE TABLE notes (
        id INT PRIMARY KEY,
        body TEXT DEFAULT 'a--b, ''quoted'')'
      );
    `);
    expect(s.tables.map((t) => t.name)).toEqual(['notes']);
    expect(s.tables[0]?.columns).toHaveLength(2);
  });
});

describe('parseSchema: 表レベル制約', () => {
  it('複合PRIMARY KEYとUNIQUEを列に反映する', () => {
    const s = parseSchema(`CREATE TABLE order_items (
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      sku VARCHAR(40),
      PRIMARY KEY (order_id, product_id),
      UNIQUE (sku)
    );`);
    const cols = s.tables[0]?.columns;
    expect(cols?.[0]?.primaryKey).toBe(true);
    expect(cols?.[1]?.primaryKey).toBe(true);
    expect(cols?.[2]?.unique).toBe(true);
  });

  it('MySQLのKEY・INDEX行を読み飛ばす', () => {
    const s = parseSchema(`CREATE TABLE t (
      id INT PRIMARY KEY,
      name VARCHAR(50),
      KEY idx_name (name),
      INDEX (id, name)
    );`);
    expect(s.tables[0]?.columns.map((c) => c.name)).toEqual(['id', 'name']);
  });
});

describe('parseSchema: リレーション', () => {
  it('インラインREFERENCESからリレーションを作る', () => {
    const s = parseSchema(`
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id)
      );
    `);
    expect(s.relations).toHaveLength(1);
    expect(s.relations[0]).toMatchObject({
      fromTable: 'orders',
      fromColumns: ['user_id'],
      toTable: 'users',
      toColumns: ['id'],
      one: false,
      mandatory: true,
    });
    expect(s.tables[1]?.columns[1]?.foreignKey).toBe(true);
  });

  it('FOREIGN KEY表制約と参照先列の省略(PKへ解決)を扱う', () => {
    const s = parseSchema(`
      CREATE TABLE categories (id INT PRIMARY KEY);
      CREATE TABLE products (
        id INT PRIMARY KEY,
        category_id INT,
        FOREIGN KEY (category_id) REFERENCES categories
      );
    `);
    expect(s.relations[0]?.toColumns).toEqual(['id']);
    expect(s.relations[0]?.mandatory).toBe(false);
  });

  it('ALTER TABLE ADD CONSTRAINTのFKとPKを取り込む', () => {
    const s = parseSchema(`
      CREATE TABLE users (id INT);
      CREATE TABLE posts (id INT, author_id INT NOT NULL);
      ALTER TABLE ONLY posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
      ALTER TABLE posts ADD CONSTRAINT posts_author_fk
        FOREIGN KEY (author_id) REFERENCES users (id);
    `);
    expect(s.tables[1]?.columns[0]?.primaryKey).toBe(true);
    expect(s.relations).toHaveLength(1);
    expect(s.relations[0]?.fromTable).toBe('posts');
  });

  it('FK列が一意なら1対1と判定する', () => {
    const s = parseSchema(`
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE profiles (user_id INT PRIMARY KEY REFERENCES users(id));
    `);
    expect(s.relations[0]?.one).toBe(true);
  });

  it('テーブル名の大文字小文字を区別せずに参照を解決する', () => {
    const s = parseSchema(`
      CREATE TABLE Users (id INT PRIMARY KEY);
      CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES USERS(id));
    `);
    expect(s.relations).toHaveLength(1);
    expect(s.relations[0]?.toTable).toBe('Users');
  });

  it('自己参照を許す', () => {
    const s = parseSchema(`
      CREATE TABLE categories (id INT PRIMARY KEY, parent_id INT REFERENCES categories(id));
    `);
    expect(s.relations[0]?.fromTable).toBe('categories');
    expect(s.relations[0]?.toTable).toBe('categories');
  });

  it('ON DELETE / ON UPDATE の参照アクションを読み取る', () => {
    const s = parseSchema(`
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE SET NULL
      );
    `);
    expect(s.relations[0]?.onDelete).toBe('CASCADE');
    expect(s.relations[0]?.onUpdate).toBe('SET NULL');
  });

  it('表制約・ALTERのFKでも参照アクションを拾い、無指定なら付かない', () => {
    const s = parseSchema(`
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (id INT PRIMARY KEY, a_id INT);
      CREATE TABLE c (id INT PRIMARY KEY, a_id INT, FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE NO ACTION);
      ALTER TABLE b ADD CONSTRAINT b_fk FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE RESTRICT;
    `);
    const byFrom = (name: string) => s.relations.find((r) => r.fromTable === name);
    expect(byFrom('c')?.onDelete).toBe('NO ACTION');
    expect(byFrom('c')?.onUpdate).toBeUndefined();
    expect(byFrom('b')?.onDelete).toBe('RESTRICT');
  });

  it('同一のFKが重複しても1本にまとめる', () => {
    const s = parseSchema(`
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (
        a_id INT REFERENCES a(id),
        FOREIGN KEY (a_id) REFERENCES a(id)
      );
    `);
    expect(s.relations).toHaveLength(1);
  });
});

describe('parseSchema: 警告', () => {
  it('参照先テーブルが無いFKは警告にして描画対象から外す', () => {
    const s = parseSchema(`
      CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));
    `);
    expect(s.relations).toHaveLength(0);
    expect(s.warnings.some((w) => w.includes('users'))).toBe(true);
  });

  it('テーブルの重複定義を警告する', () => {
    const s = parseSchema(`
      CREATE TABLE t (id INT);
      CREATE TABLE t (id INT, extra INT);
    `);
    expect(s.tables).toHaveLength(1);
    expect(s.tables[0]?.columns).toHaveLength(1);
    expect(s.warnings.some((w) => w.includes('重複'))).toBe(true);
  });

  it('DDL以外の文や空入力は黙って無視する', () => {
    expect(parseSchema('').tables).toHaveLength(0);
    const s = parseSchema(`
      SELECT * FROM users;
      CREATE INDEX idx ON t (x);
      CREATE TABLE real_one (id INT PRIMARY KEY);
      DROP TABLE old_one;
    `);
    expect(s.tables.map((t) => t.name)).toEqual(['real_one']);
  });
});
