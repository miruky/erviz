import { describe, expect, it } from 'vitest';
import { parseSchema } from './parse';
import { layoutSchema, type Box } from './layout';

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function boxOf(boxes: Box[], name: string): Box {
  const found = boxes.find((b) => b.table.name === name);
  if (found === undefined) throw new Error(`${name} のボックスが無い`);
  return found;
}

describe('layoutSchema', () => {
  it('空スキーマは空レイアウトを返す', () => {
    const l = layoutSchema(parseSchema(''));
    expect(l.boxes).toHaveLength(0);
    expect(l.width).toBe(0);
  });

  it('参照される側を参照する側より左に置く', () => {
    const l = layoutSchema(
      parseSchema(`
        CREATE TABLE users (id INT PRIMARY KEY);
        CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));
        CREATE TABLE order_items (
          order_id INT REFERENCES orders(id),
          n INT
        );
      `),
    );
    const users = boxOf(l.boxes, 'users');
    const orders = boxOf(l.boxes, 'orders');
    const items = boxOf(l.boxes, 'order_items');
    expect(users.x + users.width).toBeLessThan(orders.x);
    expect(orders.x + orders.width).toBeLessThan(items.x);
  });

  it('ボックス同士が重ならない', () => {
    const l = layoutSchema(
      parseSchema(`
        CREATE TABLE a (id INT PRIMARY KEY);
        CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a(id));
        CREATE TABLE c (id INT PRIMARY KEY, a_id INT REFERENCES a(id));
        CREATE TABLE d (id INT PRIMARY KEY, b_id INT REFERENCES b(id), c_id INT REFERENCES c(id));
        CREATE TABLE lone (id INT PRIMARY KEY);
      `),
    );
    expect(l.boxes).toHaveLength(5);
    for (let i = 0; i < l.boxes.length; i += 1) {
      for (let j = i + 1; j < l.boxes.length; j += 1) {
        const a = l.boxes[i];
        const b = l.boxes[j];
        if (a === undefined || b === undefined) continue;
        expect(overlaps(a, b), `${a.table.name} と ${b.table.name} が重なる`).toBe(false);
      }
    }
  });

  it('全ボックスがレイアウト境界に収まる', () => {
    const l = layoutSchema(
      parseSchema(`
        CREATE TABLE parent (id INT PRIMARY KEY, very_long_column_name_here VARCHAR(255));
        CREATE TABLE child (id INT PRIMARY KEY, parent_id INT REFERENCES parent(id));
      `),
    );
    for (const b of l.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(l.width);
      expect(b.y + b.height).toBeLessThanOrEqual(l.height);
    }
  });

  it('循環参照でも停止する', () => {
    const l = layoutSchema(
      parseSchema(`
        CREATE TABLE a (id INT PRIMARY KEY, b_id INT);
        CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a(id));
        ALTER TABLE a ADD FOREIGN KEY (b_id) REFERENCES b(id);
      `),
    );
    expect(l.boxes).toHaveLength(2);
    expect(l.width).toBeGreaterThan(0);
  });

  it('自己参照はレイアウトに影響しない', () => {
    const l = layoutSchema(
      parseSchema(`
        CREATE TABLE tree (id INT PRIMARY KEY, parent_id INT REFERENCES tree(id));
      `),
    );
    expect(l.boxes).toHaveLength(1);
  });
});
