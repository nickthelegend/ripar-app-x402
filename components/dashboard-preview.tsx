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

const gauges = [
  { label: "Credits", value: "3%", sub: "68,766 / 2,000,000" },
  { label: "Projects", value: "1%", sub: "49 total" },
  { label: "Users", value: "0%", sub: "Team members" },
];

function Gauge({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[9px] font-medium text-white/50">{label}</div>
      <div className="mt-3 flex items-end justify-center">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#ff6b2b"
              strokeWidth="3"
              strokeDasharray={`${(parseInt(value) / 100) * 94} 94`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-sm font-semibold text-white">{value}</span>
        </div>
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
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[#ff7757] to-[#ff6b2b]">
                  <span className="h-2 w-2 rotate-45 rounded-[2px] bg-white" />
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] font-semibold">Ripar</div>
                  <div className="text-[8px] text-white/40">3% used credits</div>
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
              <div className="mt-4 rounded-lg border border-white/10 p-2">
                <div className="text-[8px] text-white/40">Credits used</div>
                <div className="mt-1 h-1 rounded-full bg-white/10">
                  <div className="h-1 w-[6%] rounded-full bg-[#ff6b2b]" />
                </div>
                <button className="mt-2 w-full rounded-md bg-white/10 py-1 text-[9px] font-medium">
                  Upgrade plan
                </button>
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

              <div className="mt-5 text-[11px] font-medium text-white/70">Usage Overview</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {gauges.map((g) => (
                  <Gauge key={g.label} {...g} />
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

      
      <div className="absolute bottom-14 left-1/2 w-[440px] -translate-x-1/2 rounded-2xl border border-white/20 bg-neutral-900/40 p-6 backdrop-blur-md">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Trusted by</div>
        <div className="mt-4 flex items-center justify-between gap-4 opacity-80">
          {["Uriach", "BENITO", "Schneider", "GIRBAU"].map((n) => (
            <span key={n} className="font-serif text-lg font-bold tracking-tight text-white/80">
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
