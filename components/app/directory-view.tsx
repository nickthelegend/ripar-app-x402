"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { unitsFmt, useDirectory, whenIso, type DirectoryAgent } from "@/lib/registry-client";
import { EmptyState, Metric, PageHead, SearchInput, Sheet, SortHeader } from "./bits";

const peraApp = (id: number) => `https://testnet.explorer.perawallet.app/application/${id}/`;
const peraAddress = (a: string) => `https://testnet.explorer.perawallet.app/address/${a}/`;
const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);

type Field = "agentId" | "domain" | "registeredAt" | "jobsPaid" | "volume";

/**
 * The Identity Registry's directory.
 *
 * This is a different question from the one the Agents view answers, and the
 * difference is worth stating plainly rather than leaving for someone to
 * discover from two lists that disagree:
 *
 *   Agents    — addresses that have RECEIVED x402 settlements. Derived from the
 *               indexer. Nobody declares themselves into it; you get in by
 *               being paid. It knows no names, no domains and no ids.
 *   Directory — `ag_` boxes in IdentityRegistry 768633998. A self-attested
 *               registration: an id, a domain and the address that signed for
 *               it. Being here proves somebody registered, not that anybody
 *               ever paid them.
 *
 * Neither is a subset of the other. An agent can register and never earn, and
 * an address can earn without ever registering.
 */
export function DirectoryView() {
  const { data, status, error } = useDirectory();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: "asc" | "desc" }>({ field: "agentId", dir: "asc" });

  const agents = useMemo(() => data?.agents ?? [], [data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const found = term
      ? agents.filter(
          (a) =>
            a.domain.toLowerCase().includes(term) ||
            a.address.toLowerCase().includes(term) ||
            String(a.agentId) === term
        )
      : agents;
    const dir = sort.dir === "asc" ? 1 : -1;
    const key = (a: DirectoryAgent): number | string =>
      sort.field === "domain"
        ? a.domain
        : sort.field === "registeredAt"
          ? a.registeredAt
          : sort.field === "jobsPaid"
            ? (a.score?.jobsPaid ?? -1)
            : sort.field === "volume"
              ? (a.score?.volumeMicro ?? -1)
              : a.agentId;
    return [...found].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * dir;
      return ((x as number) - (y as number)) * dir || a.agentId - b.agentId;
    });
  }, [agents, q, sort]);

  const toggleSort = (field: Field) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));

  const scored = agents.filter((a) => a.score != null).length;

  return (
    <>
      <PageHead
        title="Agent directory"
        subtitle="Every agent registered in the ERC-8004 Identity Registry on Algorand TestNet — one ag_ box each, decoded from its ARC-4 struct."
      />

      <Sheet>
        <div className="px-4 py-3.5 text-[12.5px] leading-relaxed text-neutral-600">
          <span className="font-semibold text-neutral-900">
            This is not the same list as Agents, and neither one contains the other.
          </span>{" "}
          <span className="font-medium text-neutral-800">Directory</span> is registration: an id, a domain and
          the address that signed for it, self-attested into the Identity Registry. Being listed proves someone
          registered, not that anyone paid them.{" "}
          <span className="font-medium text-neutral-800">Agents</span> is settlement: an address observed
          receiving x402 payments on the chain. It knows no ids and no domains, and nobody can list themselves
          into it. An agent can register and never earn; an address can earn and never register.
        </div>
      </Sheet>

      {status === "error" ? (
        <div className="mt-4">
          <EmptyState
            title="Could not read the Identity Registry"
            body={`${error ?? "algod did not answer."} Nothing here is cached, so the directory shows nothing rather than a plausible empty list.`}
          />
        </div>
      ) : status === "loading" || !data ? (
        <Sheet>
          <p className="px-4 py-12 text-center text-[13px] text-neutral-400">reading box storage…</p>
        </Sheet>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.07] sm:grid-cols-3">
            <div className="bg-white px-4 py-4">
              <Metric
                label="Agents registered"
                value={String(agents.length)}
                hint="ag_ boxes that exist right now"
              />
            </div>
            <div className="bg-white px-4 py-4">
              <Metric
                label="agent_count"
                value={data.agentCount == null ? "—" : String(data.agentCount)}
                hint="highest id ever issued — ids are never reused, so this is not a live count"
              />
            </div>
            <div className="bg-white px-4 py-4">
              <Metric
                label="With a reputation record"
                value={String(scored)}
                hint={
                  scored === agents.length
                    ? "every agent has an sc_ box"
                    : `${agents.length - scored} ${agents.length - scored === 1 ? "has" : "have"} no sc_ box, which means never paid — not paid zero`
                }
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search by domain, address or id…"
              className="w-full sm:w-[320px]"
            />
            <span className="tnum ml-auto text-[12.5px] text-neutral-400">
              {rows.length} of {agents.length}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={q ? "No agent matches" : "The registry is empty"}
                body={
                  q
                    ? `Nothing in the Identity Registry matches “${q}”. Matching is exact on id and address and a substring on domain — an agent picked by a near-miss is an agent paid by mistake.`
                    : "The Identity Registry is deployed and readable and holds no ag_ boxes. An empty registry is a true answer."
                }
              />
            </div>
          ) : (
            <div className="mt-3">
              <Sheet>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-[13.5px]">
                    <thead className="border-b border-black/[0.07] text-[12px]">
                      <tr>
                        <SortHeader label="Id" field="agentId" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Domain" field="domain" sort={sort} onSort={toggleSort} />
                        <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">
                          Controlling address
                        </th>
                        <SortHeader
                          label="Registered"
                          field="registeredAt"
                          sort={sort}
                          onSort={toggleSort}
                        />
                        <SortHeader
                          label="Jobs paid"
                          field="jobsPaid"
                          sort={sort}
                          onSort={toggleSort}
                          align="right"
                        />
                        <SortHeader
                          label="Settled"
                          field="volume"
                          sort={sort}
                          onSort={toggleSort}
                          align="right"
                        />
                        <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-400">
                          Validated / disputed
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.agentId} className="border-b border-black/[0.05] last:border-0">
                          <td className="tnum px-3 py-2.5 font-medium">#{a.agentId}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <BadgeCheck size={13} className="shrink-0 text-neutral-300" />
                              {/* Not a link: the registry records a domain, it
                                  does not check that anything is served there,
                                  and a dead link would imply it had. */}
                              <span className="font-mono text-[12.5px] text-neutral-800">{a.domain}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <a
                              href={peraAddress(a.address)}
                              target="_blank"
                              rel="noreferrer"
                              title={a.address}
                              className="inline-flex items-center gap-0.5 font-mono text-[12px] text-neutral-500 underline underline-offset-2 hover:text-accent"
                            >
                              {shortAddr(a.address)}
                              <ArrowUpRight size={10} />
                            </a>
                          </td>
                          <td className="px-3 py-2.5 text-neutral-500" title={whenIso(a.registeredAt)}>
                            {whenIso(a.registeredAt).slice(0, 10)}
                          </td>
                          {/* No record and a record of zero are different facts. */}
                          <td className="tnum px-3 py-2.5 text-right">
                            {a.score ? (
                              a.score.jobsPaid
                            ) : (
                              <span className="text-[12px] text-neutral-300">no record</span>
                            )}
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-neutral-600">
                            {a.score ? unitsFmt(a.score.volumeMicro) : <span className="text-neutral-300">—</span>}
                          </td>
                          <td className="tnum px-3 py-2.5 text-right">
                            {a.score ? (
                              <>
                                <span className="text-emerald-700">{a.score.validated}</span>
                                <span className="text-neutral-300"> / </span>
                                <span className={cn(a.score.disputed ? "text-rose-600" : "text-neutral-400")}>
                                  {a.score.disputed}
                                </span>
                              </>
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sheet>
            </div>
          )}

          <p className="mt-2.5 text-[12px] leading-relaxed text-neutral-400">
            Decoded from box storage in app{" "}
            <a
              href={peraApp(data.identityApp)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-neutral-700"
            >
              {data.identityApp}
            </a>
            , with scores from app{" "}
            <a
              href={peraApp(data.reputationApp)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-neutral-700"
            >
              {data.reputationApp}
            </a>
            {data.round ? `, read at round ${data.round.toLocaleString("en-US")}` : ""}. Jobs paid counts
            distinct settlements the Reputation Registry credited; validated and disputed are verdicts the
            Validation Registry wrote. Neither is a rating anybody typed.
          </p>
        </>
      )}
    </>
  );
}
