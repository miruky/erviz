// ギャラリーと初期表示で使うサンプルスキーマ集。
// それぞれが異なる関係(1対多・1対1・多対多・自己参照)を含むよう選んである。

import { sampleDdl } from './sample';

export interface Example {
  id: string;
  name: string;
  summary: string;
  ddl: string;
}

const blog = `-- ブログ / CMS のスキーマ
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  handle VARCHAR(40) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  published_at TIMESTAMP
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  label VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  parent_id INTEGER REFERENCES comments(id),
  author_name VARCHAR(80) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
`;

const billing = `-- SaaS の課金スキーマ
CREATE TABLE accounts (
  id BIGINT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  monthly_price NUMERIC(10,2) NOT NULL
);

CREATE TABLE subscriptions (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMP NOT NULL
);

CREATE TABLE invoices (
  id BIGINT PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  amount NUMERIC(10,2) NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP
);

CREATE TABLE payment_methods (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id),
  brand VARCHAR(20) NOT NULL,
  last4 CHAR(4) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false
);
`;

const org = `-- 組織図と権限のスキーマ(自己参照と多対多)
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  manager_id INTEGER REFERENCES employees(id),
  department_id INTEGER NOT NULL
);

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  lead_id INTEGER REFERENCES employees(id)
);

ALTER TABLE employees
  ADD CONSTRAINT employees_dept_fk FOREIGN KEY (department_id) REFERENCES departments(id);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE employee_roles (
  employee_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  granted_at TIMESTAMP NOT NULL,
  PRIMARY KEY (employee_id, role_id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
`;

export const examples: Example[] = [
  {
    id: 'ecommerce',
    name: 'EC サイト',
    summary: '注文・商品・カテゴリ。多対多の注文明細つき',
    ddl: sampleDdl,
  },
  {
    id: 'blog',
    name: 'ブログ / CMS',
    summary: '投稿とタグの多対多、コメントの自己参照',
    ddl: blog,
  },
  {
    id: 'billing',
    name: 'SaaS 課金',
    summary: 'アカウント・プラン・サブスク・請求の連なり',
    ddl: billing,
  },
  {
    id: 'org',
    name: '組織と権限',
    summary: '上司への自己参照とロールの多対多',
    ddl: org,
  },
];

export const defaultExample = examples[0] as Example;

export function exampleById(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}
