"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Globe, MoreHorizontal, Pause, Play, Plus, Rocket, Trash2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { ENDPOINTS, compact, usd, type Endpoint, type Status } from "@/lib/app-data";
import { CopyButton, EmptyState, Metric, PageHead, SearchInput, Segmented, Sheet, SortHeader, StatusPill } from "./bits";
import { DeployModal } from "./deploy-modal";
import { TestConsole } from "./test-console";

type Filter = "all" | "live" | "paused" | "draft";
type Field = "name" | "price" | "calls24h" | "earned" | "p50";

export function EndpointsView() {
  const [items, setItems] = useState<Endpoint[]>(ENDPOINTS);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: "asc" | "desc" }>({ field: "earned", dir: "desc" });
  const [open, setOpen] = useState<Endpoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Endpoint | null>(null);
  const [deploying, setDeploying] = useState<Endpoint | null>(null);
  const [testing, setTesting] = useState<Endpoint | null>(null);
  const { toast } = useToast();

  const counts = useMemo(
    () => ({
      all: items.length,
      live: items.filter((e) => e.status === "live").length,
      paused: items.filter((e) => e.status === "paused").length,
      draft: items.filter((e) => e.status === "draft").length,
    }),
    [items]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scoped = filter === "all" ? items : items.filter((e) => e.status === filter);
    const found = term
      ? scoped.filter((e) => [e.name, e.slug, e.summary, ...e.tags].join(" ").toLowerCase().includes(term))
      : scoped;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...found].sort((a, b) =>
      sort.field === "name" ? a.name.localeCompare(b.name) * dir : ((a[sort.field] as number) - (b[sort.field] as number)) * dir
    );
  }, [items, filter, q, sort]);

  const toggleSort = (field: Field) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));

  function setStatus(id: string, status: Status, verb: string) {
    setItems((p) => p.map((e) => (e.id === id ? { ...e, status } : e)));
    setOpen((o) => (o && o.id === id ? { ...o, status } : o));
    toast(verb);
  }

  function remove(e: Endpoint) {
    setItems((p) => p.filter((x) => x.id !== e.id));
    setConfirmDelete(null);
    setOpen(null);
    toast(`Retired ${e.name}`, "default", {
      label: "Undo",
      onClick: () => setItems((p) => [...p, e].sort((a, b) => b.earned - a.earned)),
    });
  }

  return (
    <>
      <PageHead
        title="Endpoints"
        subtitle="Each endpoint answers HTTP 402 with a price, then runs once the caller pays. Listing publishes it to the x402 Bazaar so agents can find it unaided."
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Plus size={14} /> New endpoint
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "live", label: "Live", count: counts.live },
            { value: "paused", label: "Paused", count: counts.paused },
            { value: "draft", label: "Draft", count: counts.draft },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search name, route or tag…" className="w-full sm:w-[280px]" />
        <span className="tnum ml-auto text-[12.5px] text-neutral-400">{rows.length} of {counts.all}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "No endpoints match" : "Nothing here yet"}
          body={q ? `Nothing matches “${q}”.` : "Ship a handler and Ripar gives it a public route, a payout address and x402 middleware."}
          action={
            <button
              type="button"
              onClick={() => (q ? setQ("") : setCreating(true))}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white"
            >
              {q ? "Clear search" : "New endpoint"}
            </button>
          }
        />
      ) : (
        <Sheet>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13.5px]">
              <thead className="border-b border-black/[0.07] text-[12px]">
                <tr>
                  <SortHeader label="Endpoint" field="name" sort={sort} onSort={toggleSort} />
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Status</th>
                  <SortHeader label="Price" field="price" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Calls 24h" field="calls24h" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="p50" field="p50" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Earned" field="earned" sort={sort} onSort={toggleSort} align="right" />
                  <th scope="col" className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setOpen(e)}
                    className="group cursor-pointer border-b border-black/[0.05] transition-colors last:border-0 hover:bg-black/[0.02]"
                  >
                    <td className="px-3 py-2.5">
                      <span className="block font-medium text-neutral-900">{e.name}</span>
                      <span className="block truncate font-mono text-[11.5px] text-neutral-400">/{e.slug}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <StatusPill status={e.status} />
                        {e.listed && <Globe size={12} className="text-neutral-300" aria-label="Listed on the Bazaar" />}
                      </span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{e.price.toFixed(3)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-neutral-600">{compact(e.calls24h)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-neutral-600">{e.p50 ? `${e.p50}ms` : "—"}</td>
                    <td className="tnum px-3 py-2.5 text-right font-medium">{usd(e.earned)}</td>
                    <td className="px-2 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                      <Menu
                        align="end"
                        trigger={({ toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            aria-label={`Actions for ${e.name}`}
                            className="rounded-md p-1 text-neutral-400 opacity-0 transition-all hover:bg-black/[0.05] hover:text-neutral-900 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        )}
                      >
                        <MenuItem icon={<FlaskConical size={14} />} onClick={() => setTesting(e)}>Test</MenuItem>
                        <MenuItem icon={<Rocket size={14} />} onClick={() => setDeploying(e)}>Deploy</MenuItem>
                        {e.status === "live" ? (
                          <MenuItem icon={<Pause size={14} />} onClick={() => setStatus(e.id, "paused", `Paused ${e.name}`)}>Pause</MenuItem>
                        ) : (
                          <MenuItem icon={<Play size={14} />} onClick={() => setStatus(e.id, "live", `${e.name} is live`)}>Resume</MenuItem>
                        )}
                        <MenuItem icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(e)}>Retire</MenuItem>
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}

      <SlideOver open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} width="max-w-lg">
        {open && (
          <Detail
            e={open}
            onStatus={setStatus}
            onDelete={() => setConfirmDelete(open)}
            onDeploy={() => setDeploying(open)}
            onTest={() => setTesting(open)}
          />
        )}
      </SlideOver>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Retire ${confirmDelete?.name}?`}
        description="In-flight calls drain first. New callers receive 410 Gone. This can be undone from the toast."
      >
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
          <button type="button" onClick={() => confirmDelete && remove(confirmDelete)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-rose-700">Retire</button>
        </div>
      </Modal>

      <NewEndpoint open={creating} onClose={() => setCreating(false)} onCreate={(e) => setItems((p) => [e, ...p])} />

      <DeployModal endpoint={deploying} open={!!deploying} onClose={() => setDeploying(null)} />
      <TestConsole endpoint={testing} open={!!testing} onClose={() => setTesting(null)} />
    </>
  );
}

function Detail({
  e,
  onStatus,
  onDelete,
  onDeploy,
  onTest,
}: {
  e: Endpoint;
  onStatus: (id: string, s: Status, v: string) => void;
  onDelete: () => void;
  onDeploy: () => void;
  onTest: () => void;
}) {
  const url = `https://api.ripar.io/a/${e.slug}`;
  const snippet = `curl ${url} \\\n  -H 'content-type: application/json' \\\n  -d '{}'`;

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-2.5">
          <StatusPill status={e.status} />
          {e.listed && <span className="text-[12px] text-neutral-400">· listed on the Bazaar</span>}
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">{e.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-5 border-t border-black/[0.07] pt-5">
        <Metric label="Price" value={e.price.toFixed(3)} unit="USDC / request" />
        <Metric label="Calls (24h)" value={compact(e.calls24h)} hint={`${e.callsTotal.toLocaleString("en-US")} lifetime`} />
        <Metric label="Earned" value={usd(e.earned)} unit="USDC" />
        <Metric label="Success" value={e.successRate ? `${(e.successRate * 100).toFixed(1)}%` : "—"} hint={e.p50 ? `p50 ${e.p50}ms` : undefined} />
      </div>

      <div className="border-t border-black/[0.07] pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-neutral-900">Call it</h3>
          <CopyButton text={snippet} what="the curl snippet" />
        </div>
        <pre className="mt-2.5 overflow-x-auto rounded-lg border border-black/[0.07] bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed text-neutral-700">
{snippet}
        </pre>
        <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
          Unpaid, that returns <span className="font-mono">402</span> with the quote. Attach{" "}
          <span className="font-mono">X-PAYMENT</span> and retry to run it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
          >
            <FlaskConical size={13} /> Open test console
          </button>
          <button
            type="button"
            onClick={onDeploy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
          >
            <Rocket size={13} /> Deploy
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-t border-black/[0.07] pt-5">
        {e.status === "live" ? (
          <button type="button" onClick={() => onStatus(e.id, "paused", `Paused ${e.name}`)} className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:border-black/20">Pause</button>
        ) : (
          <button type="button" onClick={() => onStatus(e.id, "live", `${e.name} is live`)} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800">Set live</button>
        )}
        <button type="button" onClick={onDelete} className="ml-auto rounded-lg px-3 py-1.5 text-[13px] font-medium text-rose-600 hover:bg-rose-50">Retire</button>
      </div>
    </div>
  );
}

function NewEndpoint({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (e: Endpoint) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0.010");
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useToast();

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function submit() {
    if (!name.trim()) return setErr("Name the endpoint so callers know what it does.");
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return setErr("Price must be greater than zero.");
    onCreate({
      id: `ep_${Math.abs(slug.length * 977).toString(16)}`,
      name: name.trim(), slug, summary: "No description yet.", status: "draft",
      price: p, calls24h: 0, callsTotal: 0, earned: 0, p50: 0, successRate: 0,
      listed: false, tags: [], updated: "just now",
    });
    toast(`Created ${name.trim()} as a draft`, "success");
    setName(""); setErr(null); onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New endpoint" description="Creates a draft. Deploy a handler to it, then set it live.">
      <div className="space-y-4">
        <label className="block">
          <span className="text-[12.5px] font-medium text-neutral-700">Name</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(null); }}
            placeholder="Wallet Risk Score"
            className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-[13.5px] outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
          {slug && <span className="mt-1.5 block font-mono text-[11.5px] text-neutral-400">api.ripar.io/a/{slug}</span>}
        </label>
        <label className="block">
          <span className="text-[12.5px] font-medium text-neutral-700">Price per request (USDC)</span>
          <input
            value={price}
            onChange={(e) => { setPrice(e.target.value); setErr(null); }}
            inputMode="decimal"
            className="tnum mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-[13.5px] outline-none focus:border-neutral-400"
          />
        </label>
        {err && <p className="text-[12.5px] text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
          <button type="button" onClick={submit} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800">Create</button>
        </div>
      </div>
    </Modal>
  );
}
