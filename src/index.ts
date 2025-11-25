// ライブラリとしての公開面。DDL文字列からSVG文字列まで一直線に使える。

export { parseSchema } from './parse';
export type { Column, Relation, Schema, Table } from './parse';
export { layoutSchema, typeLabel, HEADER_H, ROW_H } from './layout';
export type { Box, Layout } from './layout';
export { renderSvg } from './render';

import { parseSchema } from './parse';
import { layoutSchema } from './layout';
import { renderSvg } from './render';

/** DDLを受け取りER図のSVG文字列を返すショートハンド */
export function ddlToSvg(sql: string): string {
  const schema = parseSchema(sql);
  return renderSvg(layoutSchema(schema), schema);
}
