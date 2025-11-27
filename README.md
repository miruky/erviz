<img src="public/logo.svg" width="88" align="right" alt="ervizのロゴ">

# erviz

[![CI](https://github.com/miruky/erviz/actions/workflows/ci.yml/badge.svg)](https://github.com/miruky/erviz/actions/workflows/ci.yml)
[![Deploy](https://github.com/miruky/erviz/actions/workflows/deploy.yml/badge.svg)](https://github.com/miruky/erviz/actions/workflows/deploy.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

**CREATE TABLE文を貼るだけで、ER図をクロウズフット記法のSVGとして描き出すブラウザツール。**

公開ページ: https://miruky.github.io/erviz/

## 概要

スキーマの全体像を確認したい場面で手元にあるのは、たいていマイグレーションファイルや `pg_dump --schema-only` の出力、つまり生のDDLだ。ervizはそのDDLをそのまま入力にする。専用のDSLに書き直す必要はなく、貼り付ければテーブルと外部キーを読み取り、参照される側を左に置く層状レイアウトでER図を組み立てる。処理はすべてブラウザ内で完結し、スキーマがサーバーに送られることはない。

図はSVG文字列として生成され、そのままダウンロード・コピーできる。出力ファイルにはスタイルが埋め込まれており、単体で開いてもライト・ダークのテーマに追従する。READMEやドキュメントにそのまま貼れるER図を、DDLから数秒で作るのがこのツールの仕事だ。

## アーキテクチャ

![ervizの処理の流れ](docs/architecture.svg)

パーサはER図に必要な情報(テーブル・列・キー・参照)だけを読むトレラントな作りで、解釈できない文は画面の警告リストに残して読み飛ばす。SQL全体の文法検証はしない。レイアウトは外部キーの依存から層番号を決める決定的なアルゴリズムで、同じDDLからは常に同じ図ができる。

## 技術スタック

| 領域                 | 採用技術                      |
| -------------------- | ----------------------------- |
| 言語                 | TypeScript 5(strict)          |
| ビルド               | Vite                          |
| 解析・描画           | 自前実装(外部依存なし)        |
| モーション           | GSAP + ScrollTrigger(UIのみ)  |
| テスト               | Vitest                        |
| リンタ・フォーマッタ | ESLint + Prettier             |
| CI / 配信            | GitHub Actions + GitHub Pages |

解析・レイアウト・描画(`parse.ts` / `layout.ts` / `render.ts`)は外部依存を持たない。GSAPはスタジオの出現アニメーションにのみ使い、生成されるSVG自体には含まれない。

## 使い方

[公開ページ](https://miruky.github.io/erviz/)のスタジオにDDLを貼ると、右ペインに図が出る。ドラッグでパン、ホイールで拡大縮小、ダブルクリックで全体表示に戻る。テーブルにカーソルを合わせると、その関係だけが浮き上がる。

入力内容はブラウザに保存され、次に開いたときに復元される。用意したスキーマ(ECサイト・ブログ・SaaS課金・組織図)はワンクリックで読み込める。図は横並び(参照先を左)と縦並び(参照先を上)を切り替えられ、SVG・PNGでの保存、SVGのクリップボードコピー、状態を載せた共有リンクの発行に対応する。表示はライト・ダーク・自動から選べ、選択はOSの設定と独立して保存される。

主なキーボードショートカット: <kbd>Ctrl/Cmd</kbd>+<kbd>Enter</kbd> で全体表示、<kbd>Ctrl/Cmd</kbd>+<kbd>S</kbd> でSVG保存、<kbd>D</kbd> で並び方向の切替、<kbd>?</kbd> で一覧。

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id)
);
```

この入力から「users(1)対orders(多)」の関係線を持つ図ができる。読み取れる構文は次のとおり。

| 構文                                          | 解釈                               |
| --------------------------------------------- | ---------------------------------- |
| 列定義のインライン `REFERENCES t(col)`        | 外部キー                           |
| 表レベルの `FOREIGN KEY (a) REFERENCES t (b)` | 外部キー(複合キー対応)             |
| `ALTER TABLE ... ADD CONSTRAINT ...`          | 外部キー・主キー・UNIQUEの後付け   |
| `PRIMARY KEY (a, b)` / `UNIQUE (a)`           | キー表示と多重度判定に反映         |
| `` `x` `` / `"x"` / `[x]` / `schema.x`        | 引用・修飾識別子                   |
| `--` / `/* */` コメント                       | 読み飛ばし(文字列リテラル内は保持) |

図の記法: 鍵アイコンが主キー、鎖アイコンが外部キー、型名末尾の `?` がNULL許容。関係線の端は、多側がクロウズフット(さらに必須参照は垂直バー、NULL許容参照は円)、1側が垂直バー。外部キー列自体が一意(主キーまたはUNIQUE)の場合は1対1として両端をバーで描く。

ライブラリとしても使える:

```ts
import { ddlToSvg } from './src';

const svg = ddlToSvg('CREATE TABLE t (id INT PRIMARY KEY);');
// "<svg id=\"er\" xmlns=... viewBox=\"0 0 224 98\" ...>...</svg>"

// 縦並び(参照先を上)にする
const vertical = ddlToSvg(sql, { direction: 'TB' });
```

`parseSchema` / `layoutSchema` / `renderSvg` を個別に呼べば、解析結果の検査や独自レイアウトにも使える。

制約も書いておく。ストアドプロシージャやトリガー本体のように文中にセミコロンを含む構文は分割を誤ることがある。`ALTER TABLE ... ADD COLUMN` のインライン `REFERENCES` は未対応。CHECK制約やインデックスは図に影響しないため無視する。

## プロジェクト構成

- `src/`
  - `parse.ts` — DDLの字句解析とテーブル・リレーション抽出
  - `layout.ts` — FK依存に基づく層状の自動配置(横並び・縦並び)
  - `render.ts` — クロウズフット記法のSVG文字列生成
  - `examples.ts` + `sample.ts` — そのまま試せるサンプルスキーマ集
  - `theme.ts` — ライト・ダーク・自動の解決ロジック
  - `share.ts` — DDLを共有リンクのハッシュに載せる符号化
  - `png.ts` — SVGからPNGへのラスタライズ
  - `main.ts` + `index.html` — スタジオ(エディタ・パン/ズーム・各種書き出し)
  - `index.ts` — ライブラリとしての公開面(`ddlToSvg` ほか)
- `docs/` — アーキテクチャ図
- `.github/workflows/` — CIとPagesデプロイ

## はじめ方

前提: Node.js 22以上。

```
git clone https://github.com/miruky/erviz.git
cd erviz
npm install
npm run dev     # 開発サーバー
npm test        # Vitest
npm run lint    # ESLint
npm run build   # 型チェック + ビルド
```

## 設計方針

**DDLをそのまま入力にする。** ER図ツールの多くは専用記法への書き直しを求めるが、スキーマの正は常にDDL側にある。手元のファイルを無加工で貼れるなら、図が古くなったら貼り直すだけで済む。

**読めない文で止まらない。** 方言の海であるSQLを完全にパースする道は選ばず、読めた分だけ描いて読めなかった分を警告として明示する。図を出すことが目的のツールでは、エラーで何も出ないのが一番役に立たない。

**SVGは単体で配れる形にする。** 出力にはviewBoxとスタイルが埋め込まれ、特定のページに依存しない。リポジトリにコミットすればプレビューでき、prefers-color-schemeで閲覧側のテーマにも追従する。

**レイアウトは決定的にする。** 乱数や物理シミュレーションを使わないため、同じDDLからは同じSVGができる。図をGit管理しても差分はスキーマの変更だけを映す。

**動きは添えるが、強要しない。** スタジオには出現アニメーションやホバーの強調を入れているが、`prefers-reduced-motion: reduce` を指定した環境では一切動かさない。マーキーはホバーで止まり、図の操作はキーボードからも完結する。

## ライセンス

[MIT](LICENSE)
