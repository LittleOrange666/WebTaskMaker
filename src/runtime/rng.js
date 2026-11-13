// 可重現的亂數：FNV-1a 雜湊 + sfc32 產生器

export function hashSeed(str) {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(String(str));
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 解析 seed=xxx 的值：純數字直接使用（取 32 位元），其他字串取雜湊 */
export function parseSeed(v) {
  if (/^\d+$/.test(v)) return Number(BigInt(v) % 4294967296n);
  return hashSeed(v);
}

export function makeRng(seed) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
  const nextU32 = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) nextU32();
  // 53 位元精度的 [0, 1) 浮點數
  const random = () => (nextU32() * 2 ** 21 + (nextU32() >>> 11)) / 2 ** 53;
  return { random, nextU32 };
}
