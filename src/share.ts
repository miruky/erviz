// DDLをURLのハッシュに載せて共有できるようにする。
// UTF-8バイト列をbase64urlにし、`#s=...` の形でやり取りする。
// 長すぎるスキーマはURLに収まらないため、上限を超える場合は共有を断る。

const PARAM = 's';
const MAX_TOKEN = 24000; // 多くのブラウザのURL長制限に収まる安全側の上限

function bytesToBinary(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function binaryToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return b64 + pad;
}

/** DDL文字列をbase64urlトークンにする。上限超過時は null */
export function encodeDdl(sql: string): string | null {
  try {
    const bytes = new TextEncoder().encode(sql);
    const token = toBase64Url(btoa(bytesToBinary(bytes)));
    return token.length > MAX_TOKEN ? null : token;
  } catch {
    return null;
  }
}

/** base64urlトークンをDDL文字列に戻す。壊れていれば null */
export function decodeDdl(token: string): string | null {
  try {
    const bytes = binaryToBytes(atob(fromBase64Url(token)));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** `#s=...` を含むハッシュからDDLを取り出す */
export function readShareHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of h.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === PARAM) return decodeDdl(part.slice(eq + 1));
  }
  return null;
}

/** DDLから共有用ハッシュ(先頭の#込み)を作る。載らなければ null */
export function buildShareHash(sql: string): string | null {
  const token = encodeDdl(sql);
  return token === null ? null : `#${PARAM}=${token}`;
}

export { MAX_TOKEN };
