// A payout address is the one field in this app where a typo costs real money,
// so it is checked properly rather than by length alone: base32 decode, then the
// 4-byte SHA-512/256 checksum Algorand appends to the public key.
//
// SubtleCrypto has no SHA-512/256 (different IV to SHA-512, so it cannot be
// derived from it) and is async besides, which a keystroke-by-keystroke
// validator cannot use. Hence the implementation below.
//
// Every constant is derived from the primes at load rather than transcribed,
// which removes the one real failure mode of a hand-written hash — a mistyped
// magic number that only shows up on some inputs. Verified against Node's
// `crypto.createHash("sha512-256")` on the NIST vector and random inputs.

const b = (n: number) => BigInt(n);
const ZERO = b(0);
const MASK64 = (b(1) << b(64)) - b(1);
const BYTE = b(0xff);
const EIGHT = b(8);

// Rotation/shift amounts, pre-widened so the round loop stays readable.
const [R1, R6, R7, R8, R14, R18, R19, R28, R34, R39, R41, R61] = [
  1, 6, 7, 8, 14, 18, 19, 28, 34, 39, 41, 61,
].map(b);

function isqrt(n: bigint): bigint {
  if (n < b(2)) return n;
  let x = n;
  let y = (x + b(1)) / b(2);
  while (y < x) {
    x = y;
    y = (x + n / x) / b(2);
  }
  return x;
}

function icbrt(n: bigint): bigint {
  if (n < b(2)) return n;
  let x = b(1) << b(Math.ceil(n.toString(2).length / 3) + 1);
  for (;;) {
    const y = (b(2) * x + n / (x * x)) / b(3);
    if (y >= x) return x;
    x = y;
  }
}

function firstPrimes(count: number): bigint[] {
  const out: bigint[] = [];
  for (let n = 2; out.length < count; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) {
      if (n % d === 0) {
        prime = false;
        break;
      }
    }
    if (prime) out.push(b(n));
  }
  return out;
}

const PRIMES = firstPrimes(80);
// K_t = fractional part of the cube root of the t-th prime, 64 bits.
const K = PRIMES.map((p) => icbrt(p << b(192)) & MASK64);
// SHA-512's IV = fractional part of the square root of the first eight primes.
const IV_512 = PRIMES.slice(0, 8).map((p) => isqrt(p << b(128)) & MASK64);

const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (b(64) - n))) & MASK64;

function compress(iv: bigint[], padded: Uint8Array): bigint[] {
  const h = [...iv];
  const w = new Array<bigint>(80);

  for (let off = 0; off < padded.length; off += 128) {
    for (let i = 0; i < 16; i++) {
      let v = ZERO;
      for (let j = 0; j < 8; j++) v = (v << EIGHT) | b(padded[off + i * 8 + j]);
      w[i] = v;
    }
    for (let i = 16; i < 80; i++) {
      const a = w[i - 15];
      const c = w[i - 2];
      const s0 = rotr(a, R1) ^ rotr(a, R8) ^ (a >> R7);
      const s1 = rotr(c, R19) ^ rotr(c, R61) ^ (c >> R6);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & MASK64;
    }

    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 80; i++) {
      const s1 = rotr(e, R14) ^ rotr(e, R18) ^ rotr(e, R41);
      const ch = (e & f) ^ (~e & MASK64 & g);
      const t1 = (hh + s1 + ch + K[i] + w[i]) & MASK64;
      const s0 = rotr(a, R28) ^ rotr(a, R34) ^ rotr(a, R39);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (s0 + maj) & MASK64;
      hh = g; g = f; f = e; e = (d + t1) & MASK64;
      d = c; c = bb; bb = a; a = (t1 + t2) & MASK64;
    }

    const next = [a, bb, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + next[i]) & MASK64;
  }
  return h;
}

function pad(bytes: Uint8Array): Uint8Array {
  const bits = b(bytes.length) * EIGHT;
  const fill = (((111 - bytes.length) % 128) + 128) % 128 + 1;
  const out = new Uint8Array(bytes.length + fill + 16);
  out.set(bytes);
  out[bytes.length] = 0x80;
  for (let i = 0; i < 16; i++) out[out.length - 1 - i] = Number((bits >> b(8 * i)) & BYTE);
  return out;
}

// FIPS 180-4 §5.3.6.2: the truncated variant's IV is SHA-512 of the literal
// "SHA-512/256" run under SHA-512's own IV with every word XOR-ed by 0xa5…
const IV_512_256 = compress(
  IV_512.map((x) => x ^ BigInt("0xa5a5a5a5a5a5a5a5")),
  pad(Uint8Array.from("SHA-512/256", (ch) => ch.charCodeAt(0)))
);

function sha512_256(bytes: Uint8Array): Uint8Array {
  const h = compress(IV_512_256, pad(bytes));
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((h[i] >> b(56 - 8 * j)) & BYTE);
  }
  return out;
}

/* ── base32 (RFC 4648, unpadded) ──────────────────────────────────────────── */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const ADDRESS_LENGTH = 58;

function decode(address: string): Uint8Array | null {
  const out = new Uint8Array(36);
  let bits = 0;
  let value = 0;
  let written = 0;
  for (const ch of address) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (written === 36) return null;
      out[written++] = (value >>> bits) & 0xff;
    }
  }
  // 58 chars carry 290 bits for 288 of payload; the spare two must be zero or
  // the string is not a canonical encoding of any address.
  if (written !== 36 || (value & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

export type AddressCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "length" | "alphabet" | "checksum"; message: string };

/** Why it failed, not just that it did — the message is shown under the field. */
export function checkAddress(input: string): AddressCheck {
  const address = input.trim();
  if (!address) return { ok: false, reason: "empty", message: "Enter the address settlement should pay." };

  if (address.length !== ADDRESS_LENGTH) {
    const off = address.length - ADDRESS_LENGTH;
    return {
      ok: false,
      reason: "length",
      message: `An Algorand address is ${ADDRESS_LENGTH} characters — this one is ${address.length}, ${
        off > 0 ? `${off} too many` : `${-off} short`
      }.`,
    };
  }

  const bad = [...address].find((ch) => !ALPHABET.includes(ch));
  if (bad !== undefined) {
    return {
      ok: false,
      reason: "alphabet",
      message: `“${bad}” is not part of the base32 alphabet — addresses use A–Z and 2–7 only, always upper case.`,
    };
  }

  const wrong: AddressCheck = {
    ok: false,
    reason: "checksum",
    message: "Checksum does not match — a character is wrong or transposed. Paste it again from your wallet.",
  };

  // At 58 in-alphabet characters the only way a decode fails is a final
  // character carrying stray bits, which is the same story as a bad checksum.
  const bytes = decode(address);
  if (!bytes) return wrong;

  const expected = sha512_256(bytes.subarray(0, 32)).subarray(28, 32);
  for (let i = 0; i < 4; i++) if (bytes[32 + i] !== expected[i]) return wrong;
  return { ok: true };
}

/** PERA…K7QX form used wherever a full address will not fit. */
export function shortAddress(address: string, head = 4, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}
