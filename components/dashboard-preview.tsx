import {
  BarChart3,
  Blocks,
  Bot,
  Database,
  FolderKanban,
  Home,
  Rocket,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Mark } from "@/components/ui/mark";

const sidebar = [
  { label: "Home", Icon: Home, active: true },
  { label: "Compose", Icon: Sparkles },
  { label: "Projects", Icon: FolderKanban },
  { label: "Agents", Icon: Database },
  { label: "Integrations", Icon: Blocks },
  { label: "Usage", Icon: BarChart3 },
];

const cards = [
  { title: "Create Agent", desc: "LLM-powered agents for your org.", Icon: Bot },
  { title: "Create Workflow", desc: "Automate multi-step work across your apps.", Icon: Wand2 },
  { title: "Post a job", desc: "Let agents bid, pay on a verified result.", Icon: Sparkles },
  { title: "Workflows", desc: "Triggers, retries, guaranteed runs.", Icon: Database },
  { title: "Create Deployment", desc: "Ship projects to production.", Icon: Rocket },
];

// Prices and settings — things an operator CONFIGURES — never totals.
//
// This block used to be three usage gauges: "Credits 3% · 68,766 / 2,000,000",
// "Projects 1% · 49 total", "Users 0%". Nobody has 68,766 credits here and
// there are no 49 projects; those were adoption figures drawn on a login page,
// and a reader has no way to tell a decorative number from a measured one. A
// price describes the product. A cumulative total is a claim.
const settings = [
  { label: "Per call", value: "0.01", sub: "USDC, quoted in the 402" },
  { label: "Settles to", value: "your wallet", sub: "Ripar never holds it" },
  { label: "Network", value: "Algorand", sub: "USDC, six decimals" },
];

function Setting({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[9px] font-medium text-white/50">{label}</div>
      <div className="mt-3 flex h-14 items-center justify-center">
        <span className="text-center text-sm font-semibold leading-tight text-white">{value}</span>
      </div>
      <div className="mt-2 text-center text-[8px] text-white/30">{sub}</div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div className="relative hidden h-full w-full overflow-hidden lg:block">
      {/* tilted dashboard */}
      <div
        className="absolute left-10 top-12 w-[820px]"
        style={{ transform: "perspective(1800px) rotateY(-16deg) rotateX(2deg)" }}
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex text-white">
            {/* sidebar */}
            <div className="w-44 shrink-0 border-r border-white/10 bg-neutral-900/60 p-3">
              <div className="mb-4 flex items-center gap-2">
                <Mark size={22} />
                <div className="leading-tight">
                  <div className="text-[11px] font-semibold">Ripar</div>
                  <div className="text-[8px] text-white/40">Algorand TestNet</div>
                </div>
              </div>
              <div className="space-y-0.5">
                {sidebar.map(({ label, Icon, active }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] ${
                      active ? "bg-white/10 text-white" : "text-white/50"
                    }`}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </div>
                ))}
              </div>
              <div className="mt-4 text-[8px] uppercase tracking-wide text-white/30">Recents</div>
              <div className="mt-1.5 space-y-1 text-[10px] text-white/50">
                <div>Test</div>
                <div>demo-uriach</div>
                <div>demo-carbonell</div>
              </div>
              {/* No "credits used" bar. There are no credits and no plan to
                  upgrade — Ripar is paid per request, in the 402, and there is
                  nothing to top up. A meter drawn here would be a fiction about
                  the pricing model, not just about the number. */}
              <div className="mt-4 rounded-lg border border-white/10 p-2">
                <div className="text-[8px] text-white/40">Billing</div>
                <div className="mt-1 text-[9px] leading-tight text-white/60">
                  Per request. No plan, no seats, nothing to top up.
                </div>
              </div>
            </div>

            {/* main */}
            <div className="flex-1 p-5">
              <div className="text-lg font-semibold">Good afternoon, John Doe</div>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {cards.map((c) => (
                  <div key={c.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <c.Icon className="mb-2 h-4 w-4 text-[#ff8a5c]" />
                    <div className="text-[10px] font-semibold">{c.title}</div>
                    <div className="mt-0.5 text-[8px] leading-tight text-white/40">{c.desc}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 text-[11px] font-medium text-white/70">Settlement</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {settings.map((s) => (
                  <Setting key={s.label} {...s} />
                ))}
              </div>

              <div className="mt-5 text-[11px] font-medium text-white/70">Latest Projects</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {["Demo Chemical Corp", "Demo Test", "Demo Public Gov"].map((p, i) => (
                  <div key={p} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-emerald-400" : "bg-white/20"}`} />
                      <span className="text-[9px] text-white/50">{i === 0 ? "Deployed" : "Not deployed"}</span>
                    </div>
                    <div className="mt-1.5 text-[10px] font-medium">{p}</div>
                    <div className="text-[8px] text-white/30">Updated recently</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* A "Trusted by" strip naming Uriach, BENITO, Schneider and GIRBAU used
          to sit here. None of them is a customer. Four real companies presented
          as logos on a login page is a stronger claim than any number on this
          screen, and it was the least true thing in the app. */}
      <div className="absolute bottom-14 left-1/2 w-[440px] -translate-x-1/2 rounded-2xl border border-white/20 bg-neutral-900/40 p-6 backdrop-blur-md">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
          How you get paid
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-white/70">
          A caller with no account gets a 402 carrying your price, attaches USDC and retries. Settlement lands
          in your own Algorand address — Ripar never holds it.
        </p>
      </div>
    </div>
  );
}
