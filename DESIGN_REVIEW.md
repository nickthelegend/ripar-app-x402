# Mission Control — handoff

Branch: `feature/mission-control-v1` · Route: **`/mission`**

A full-bleed, live visualisation of an agent economy settling in real time. Glass
panels float over it; the visualisation is the page, not a widget on it.

```bash
npm install
npm run dev -- -p 3002       # http://localhost:3002/mission
```

Nothing else in the app was touched. `/dashboard`, `/login` and the rest are
untouched, and `app/globals.css` gained one additive block at the end.

> **Everything on this screen is simulated.** There is no chain, no backend and
> no network call. `lib/mission/economy.ts` invents every settlement. The screen
> carries a `SIMULATED` badge for exactly this reason — keep it there until real
> data is wired in, per the rule in the root README about labelling illustrative
> figures.

---

## Read this first

**The visual design has never been looked at.** I built it, type-checked it,
built it for production and it renders without errors — but the browser
screenshots failed to save and I could not read a single frame back. Every
aesthetic claim below is intent, not observation. **Open it before you trust
any of it.** If something looks wrong, it probably is, and it is my fault rather
than a subtlety you are missing.

**Performance is unresolved.** See [Performance](#performance).

---

## Architecture

Three layers, and the boundary between them is the point.

```
lib/mission/economy.ts     the simulation   — no React, no canvas, no DOM
lib/mission/renderer.ts    the light        — no React, owns the canvas
components/mission/*       the surface      — React, owns no animation state
```

The economy knows about money and never about brightness. The renderer knows
about brightness and never about money. When a payment lands, the *renderer*
decides the node lights up — that is why a node brightens on **arrival** rather
than on send, which the economy could not have expressed because it has no
notion of a payment being in flight.

### Files

| File | What it is |
|---|---|
| `lib/mission/economy.ts` | The simulator. Poisson arrivals on a breathing rate, bursts, lulls, preferential attachment, refunds, First Light gating. Exposes `tick()`, `subscribe()`, `getSnapshot()`. |
| `lib/mission/renderer.ts` | The canvas. Particles, arcs, nodes, edges, rings, ceremony, intro. One `frame()` call per rAF. |
| `lib/mission/layout.ts` | Where agents sit. Seven loose constellations, relaxed apart. Runs once. |
| `lib/mission/sprites.ts` | Four pre-rendered glow sprites and the baked sky texture. |
| `lib/mission/palette.ts` | Canvas-side colour tokens. **Must stay in step with the `@theme` block in `app/globals.css`.** |
| `lib/mission/rng.ts` | Seeded RNG, gaussian, exponential. |
| `lib/mission/dna.ts` | Agent DNA — placeholder, see below. |
| `lib/mission/use-economy.tsx` | Context + `useSyncExternalStore` binding. |
| `lib/mission/use-animation-frame.ts` | The single rAF loop, and reduced-motion. |
| `components/mission/stream-canvas.tsx` | Canvas host. Owns the only animation loop on the page. |
| `components/mission/mission-control.tsx` | Composition and the staged entrance. |

### Two decisions worth keeping

**The economy is deterministic and never reads the wall clock.** Same seed →
same roster, same prices, same warm-up, byte for byte. That is what lets it be
constructed on the server *and* in the browser and still hydrate cleanly, so the
panels server-render with a mature economy in them instead of zeros. If you ever
put `Date.now()` or `Math.random()` in `economy.ts`, hydration breaks and the
First Light gating stops being reproducible. Don't.

**It warms up before the first frame.** `WARM_MS` runs ~3.2 simulated hours at
construction (a few ms of real time) so the field opens with real hubs, real
history and a full timeline. This is the whole answer to "beautiful empty state
impossible" — there is no empty state because there is no moment zero.

**Zero React renders per frame.** The engine commits a snapshot at 5Hz, not
60Hz. Live figures use `<Odometer>`, which writes `textContent` from inside the
rAF loop and never re-renders. Hover re-renders exactly once per hovered-agent
change. If you find yourself adding `useState` inside the animation loop, stop.

---

## Design system

| Token | Value | Role |
|---|---|---|
| `ink` | `#070A10` | The dome. Blue-black, not neutral black. |
| `gold` | `#E8B65A` | Value. Every settlement, every earned figure. |
| `mint` | `#9EE6C8` | Health, and only health. |
| `frost` | `#E8EDF7` | Type. |
| `haze` | `#6B7A93` | Secondary type, dormant agents. |

Type is **IBM Plex Mono** for every figure, label and canvas annotation, and
Inter for prose. The rule: if it is a number or a label, it is Plex.

The deliberate restraint is that the visualisation is the only bold thing.
Panels are quiet on purpose. Resist the urge to make them interesting.

---

## What the polish pass changed

The first version worked; it was not yet good. What changed, and why:

**Arrivals now feel like something happened.** A payment landing sets a `flash`
that swells and releases over 460ms on a `sin(π · t^0.62)` curve — fast attack,
slow release, zero at both ends so nothing snaps. It drives both node radius and
a hot bloom. Underneath it, a slower 1.4s `energy` afterglow. Pop, then warmth.

**Nothing is ever perfectly still.** Every agent breathes on its own period
(1180–2220ms, derived from its phase, so the field never inhales together) and
wanders on two slow sines. Sub-pixel, and you would only notice it if it stopped.

**The scene has depth.** The sky parallaxes one way against the pointer, the
agent field parallaxes the other, and nearer agents move further than far ones.
Agents at the rim are dimmer and slightly smaller. It is a volume now, not
stickers on glass.

**Rings ripple instead of ping.** Quintic-out expansion, squared alpha falloff,
line width thinning as the circumference grows.

**Particles stopped marching in step.** Each carries ±15% duration jitter.

**Three things were deleted.** The replay scrubber (a track and handle that
could not be dragged, because replay does not exist — a control that mimes a
feature is worse than no control, and it was the second brightest thing on
screen). The elapsed clock in the top rail (the only thing changing every second
for no reason). The second "Live" indicator in the settlement feed. The
timeline's bars were also desaturated from gold to haze, warming only toward the
present, so they stop competing with the field.

---

## Performance

**This is the open question and you should treat it as unfinished.**

Measured only in headless Chromium under **SwiftShader — pure CPU software
rendering, no GPU**. Numbers there: 26.7fps before the optimisation pass, 17.7fps
after it. On a real GPU this should be a different story entirely, but **I never
measured on one**, so that is a hope rather than a finding.

The second number being worse than the first is not explained. Candidates, in
the order I would check them:

1. **`backdrop-blur-2xl` on the glass panels.** Four large blurred surfaces.
   Backdrop filters are brutal in software rendering and nearly free on a GPU —
   this alone could account for the whole figure. Test by dropping the panels to
   a flat `bg-ink/80` and re-measuring; if the number jumps, the canvas was never
   the problem.
2. **Machine load.** Load average was 2.84–9.21 across the runs, on 8 cores, in
   WSL2 on a Windows filesystem, with a production build running concurrently.
   The two measurements were not taken under comparable conditions and may simply
   not be comparable.
3. **The renderer itself.** Isolate it by hiding the panels (`display:none` on
   the overlay) and measuring the canvas alone.

Optimisations already in place, so you do not undo them by accident: four
fixed glow sprites scaled by `drawImage` rather than a gradient per node per
frame (this one matters enormously — a sprite key containing a breathing radius
or a blended colour rebuilds a canvas every frame for every node); the ink base
and vignette baked into the sky texture so the backdrop is one `drawImage`; wide
halos only for nodes that are actually busy; DPR capped at 2; opaque canvas
context; particle and ring pools with no allocation in the hot loop.

How to measure:

```js
// paste in the console on /mission, after the intro has finished
const f=[];let l=performance.now(),s=l;
(function t(n){f.push(n-l);l=n;n-s<4000?requestAnimationFrame(t):
console.log('fps',(1000/(f.reduce((a,b)=>a+b)/f.length)).toFixed(1))})(l);
```

---

## What still feels unfinished

- **The look, unverified.** See the warning at the top.
- **Mobile.** The layout is written and responsive but has never been opened on
  a phone. The stream is squeezed between a summary and a feed; it may want the
  panels as a drawer instead.
- **The hover card** can collide with the right-hand panel. It flips at 250px
  from the edge, a number picked by eye, not measured.
- **Nothing is keyboard reachable.** The canvas is `role="img"` with a label,
  and the panels are readable text, but you cannot tab to an agent. For a screen
  whose entire content is spatial that is a real gap, not a checkbox.
- **`SettlementFeed` renders twice** (mobile and desktop variants) rather than
  one component that reflows.
- **No tests.** The economy is pure, seeded and deterministic — it is unusually
  easy to test and has none.

---

## Extension points for the ceremonies branch

The next branch is First Light, First Stranger, Long Night, Graduation and DNA.
The seams are already cut:

**`Ceremony` (`lib/mission/renderer.ts`) and `renderer.onCeremony`** are the
whole pattern. First Light already uses it: the renderer dims the field, slows
the payment, and fires a callback that React renders a label from. Add
`type: "first-light" | "first-stranger" | ...` to `Ceremony` and the other four
ceremonies are the same machine with different triggers and different overlays.
Keep the rule that only one runs at a time — `this.ceremony` is the guard.

**`Agent.firstLightAt`** is the template for ceremony state: nullable, set once,
never unset. `firstStrangerAt`, `graduatedAt` follow it. First Stranger needs the
economy to distinguish payers it has seen before from ones it has not, which is
a `Set` per agent it does not have yet.

**Long Night** needs something the economy currently lacks: a notion of the
operator being away. The simulation clock is already decoupled from the wall
clock, so a night can be simulated at speed and replayed at dawn — that is the
easy version, and probably the right one.

**`lib/mission/dna.ts`** is a placeholder that hashes the handle into 15 bars.
The real thing should grow from behaviour the chain can prove: earning cadence
as rhythm, payer diversity as colour range, refund history as scars. The
signature of the function should not need to change — it takes an agent, it
returns strands.

**Sound** has no home yet. If ceremonies get audio, it wants a small module next
to the renderer with the same discipline: no React, no per-frame allocation, and
muted by default until the user asks for it.

---

## Where the real data would come in

When this stops being simulated, `lib/real-data.ts` already reads live x402
settlements off Algorand MainNet by matching the `x402-fee-payer-` and
`x402-payment-v2-` note prefixes. The shape it returns (`RealRun`, `RealAgent`)
is close to `Settlement` and `Agent` here. Swapping the source means replacing
`Economy` with something that fills the same arrays from that feed — the
renderer and every component should not need to change. That was the point of
keeping the economy free of React and the renderer free of money.
