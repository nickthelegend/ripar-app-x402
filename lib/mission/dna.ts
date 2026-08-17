// Agent DNA — placeholder.
//
// A short strand derived only from the handle, so the same agent always draws
// the same glyph and two agents never share one. Today it is a signature; the
// intent is that the bars eventually encode real behaviour (earning cadence,
// payer diversity, refund history) read off the chain, at which point the glyph
// becomes something you cannot forge by copying a name.

const STRANDS = 15;

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Strand = { height: number; warm: boolean };

export function dna(handle: string): Strand[] {
  let h = hash(handle);
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
  return Array.from({ length: STRANDS }, () => ({
    height: 0.22 + next() * 0.78,
    warm: next() > 0.45,
  }));
}
