"use client";

import { useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkAddress } from "@/lib/algorand-address";
import { useSettings } from "@/lib/settings";
import {
  compose,
  unitsFmt,
  useBoard,
  whenIso,
  type BoardJob,
  type ComposedCall,
} from "@/lib/registry-client";
import type { ActionId, LegalAction } from "@/lib/registry-actions";
import { EmptyState, Metric, PageHead, Sheet } from "./bits";
import { ComposeRefused, UnsignedCall } from "./unsigned-txn";

const peraApp = (id: number) => `https://testnet.explorer.perawallet.app/application/${id}/`;
const peraAddress = (a: string) => `https://testnet.explorer.perawallet.app/address/${a}/`;
const loraAsset = (id: number) => `https://lora.algokit.io/testnet/asset/${id}`;

const STATUS_TONE: Record<string, string> = {
  open: "text-sky-700 bg-sky-50",
  assigned: "text-amber-700 bg-amber-50",
  submitted: "text-violet-700 bg-violet-50",
  validated: "text-emerald-700 bg-emerald-50",
  disputed: "text-rose-700 bg-rose-50",
  cancelled: "text-neutral-600 bg-neutral-100",
  unknown: "text-neutral-600 bg-neutral-100",
};

const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/**
 * The onchain job board, with escrow and the next legal move on every row.
 *
 * A BUDGET is a number the client wrote into the job struct; posting a job
 * moves nothing. An ESCROW is what app 769444121 actually holds in an `es_`
 * box. A row showing a budget and no escrow is unfunded, and that distinction
 * is not cosmetic — it is the difference between an intention and a guarantee.
 *
 * Every action offered here is composed as an unsigned transaction. The board
 * refuses to build one the contract would reject, so what you see on a row is
 * what the chain will actually accept next, and from whom.
 */
export function BoardView() {
  const { data, status, error } = useBoard();
  const [open, setOpen] = useState<number | null>(null);

  const jobs = data?.jobs ?? [];

  return (
    <>
      <PageHead
        title="Job board"
        subtitle="Every job in the ERC-8004 Validation Registry on Algorand TestNet, with what is actually escrowed against it and which call the contract will accept next."
      />

      {status === "error" ? (
        <EmptyState
          title="Could not read the Validation Registry"
          body={`${error ?? "algod did not answer."} Nothing here is cached or seeded, so the board shows nothing rather than something stale.`}
        />
      ) : status === "loading" || !data ? (
        <Sheet>
          <p className="px-4 py-12 text-center text-[13px] text-neutral-400">reading box storage…</p>
        </Sheet>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.07] sm:grid-cols-4">
            <Tile
              label="Jobs on the board"
              value={String(data.totals.jobs)}
              hint={`jb_ boxes · job_count has reached ${data.terms.jobCount}`}
            />
            <Tile
              label="Budget stated"
              value={unitsFmt(data.totals.budgetStatedMicro)}
              unit={data.terms.assetName}
              hint="what the jobs say they are worth, cancelled ones excluded"
            />
            <Tile
              label="Actually escrowed"
              value={unitsFmt(data.totals.escrowedMicro)}
              unit={data.terms.assetName}
              hint={
                data.totals.fundedJobs > 0
                  ? `held against ${data.totals.fundedJobs} job${data.totals.fundedJobs === 1 ? "" : "s"}`
                  : "no es_ box exists, so the contract holds nothing"
              }
            />
            <Tile
              label="Dispute window"
              value={String(data.terms.disputeWindowSecs)}
              unit="seconds"
              hint="after a passing verdict, anyone may release"
            />
          </div>

          {jobs.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No jobs have been posted"
                body="The Validation Registry is deployed and readable and holds no jb_ boxes. An empty board is a true answer — the first post_job call appears here."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.jobId}
                  job={job}
                  assetName={data.terms.assetName}
                  assetId={data.terms.assetId}
                  appAddress={data.terms.appAddress}
                  expanded={open === job.jobId}
                  onToggle={() => setOpen(open === job.jobId ? null : job.jobId)}
                />
              ))}
            </div>
          )}

          <p className="mt-3 text-[12px] leading-relaxed text-neutral-400">
            Read from box storage on Algorand TestNet at request time — app{" "}
            <a
              href={peraApp(data.validationApp)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-neutral-700"
            >
              {data.validationApp}
            </a>
            {data.round ? `, at round ${data.round.toLocaleString("en-US")}` : ""}. Escrow is denominated in{" "}
            <a
              href={loraAsset(data.terms.assetId)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-neutral-700"
            >
              asset {data.terms.assetId}
            </a>{" "}
            and is held by the app&rsquo;s own account{" "}
            <span className="font-mono text-[11.5px]">{shortAddr(data.terms.appAddress)}</span>.
          </p>
        </>
      )}
    </>
  );
}

function Tile({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <Metric label={label} value={value} unit={unit} hint={hint} />
    </div>
  );
}

function JobCard({
  job,
  assetName,
  assetId,
  appAddress,
  expanded,
  onToggle,
}: {
  job: BoardJob;
  assetName: string;
  assetId: number;
  appAddress: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Sheet>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-black/[0.015]"
      >
        <span className="tnum text-[13.5px] font-semibold text-neutral-900">Job #{job.jobId}</span>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize",
            STATUS_TONE[job.status] ?? STATUS_TONE.unknown
          )}
        >
          {job.status}
        </span>
        <span className="text-[12.5px] text-neutral-500">
          budget <span className="tnum font-medium text-neutral-800">{unitsFmt(job.budgetMicro)}</span>{" "}
          {assetName}
        </span>
        <span className="text-[12.5px] text-neutral-500">
          escrow{" "}
          {job.funded ? (
            <span className="tnum font-medium text-emerald-700">
              {unitsFmt(job.escrowMicro)} {assetName}
            </span>
          ) : (
            <span className="font-medium text-neutral-400" title={`No es_${job.jobId} box exists`}>
              none
            </span>
          )}
        </span>
        <span className="ml-auto text-[12px] text-neutral-400">
          {job.actions.length
            ? `${job.actions.length} legal action${job.actions.length === 1 ? "" : "s"}`
            : "nothing legal"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-black/[0.07] px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Client" value={job.client} link={peraAddress(job.client)} mono />
            <Field
              label="Assigned to"
              value={
                job.serverAgentId === 0
                  ? "unassigned"
                  : `agent #${job.serverAgentId}${job.assignee ? ` · ${job.assignee.domain}` : " · no ag_ box"}`
              }
            />
            <Field
              label="Validator"
              value={
                job.validatorAgentId === 0
                  ? "none named — the client judges"
                  : `agent #${job.validatorAgentId}${job.validator ? ` · ${job.validator.domain}` : " · no ag_ box"}`
              }
            />
            <Field label="Posted" value={whenIso(job.createdAt)} />
            <Field label="Spec hash" value={shortHash(job.specHash)} title={job.specHash} mono />
            <Field
              label="Result hash"
              value={job.resultHash ? shortHash(job.resultHash) : "not submitted"}
              title={job.resultHash ?? undefined}
              mono
            />
            <Field label="Last change" value={whenIso(job.updatedAt)} />
            <Field
              label="Unfunded balance"
              value={
                job.unfundedMicro > 0
                  ? `${unitsFmt(job.unfundedMicro)} ${assetName} of the budget is not backed`
                  : "the escrow covers the stated budget"
              }
            />
          </div>

          {job.status === "validated" && job.disputeWindowClosesAt != null && (
            <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">
              The verdict landed at {whenIso(job.updatedAt)}, so the dispute window closed at{" "}
              {whenIso(job.disputeWindowClosesAt)}. Before that only the client could release; after it, anyone
              can — a validator who never returns would otherwise freeze the worker&rsquo;s money for good.
            </p>
          )}

          <div className="mt-4 border-t border-black/[0.06] pt-4">
            {job.actions.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-neutral-500">
                {job.nothingLegal ?? "No call is legal on this job in its current state."}
              </p>
            ) : (
              <div className="space-y-3">
                {job.actions.map((action) => (
                  <ActionRow
                    key={action.id}
                    job={job}
                    action={action}
                    assetName={assetName}
                    assetId={assetId}
                    appAddress={appAddress}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * One legal call, with whatever the contract needs supplied alongside it, and a
 * sender field that defaults to the address the contract will actually accept.
 */
function ActionRow({
  job,
  action,
  assetName,
  assetId,
  appAddress,
}: {
  job: BoardJob;
  action: LegalAction;
  assetName: string;
  assetId: number;
  appAddress: string;
}) {
  const { payout } = useSettings();
  const [sender, setSender] = useState(action.whoAddress ?? payout);
  const [agentId, setAgentId] = useState("");
  const [resultHash, setResultHash] = useState("");
  const [amount, setAmount] = useState(() => String(job.unfundedMicro || job.budgetMicro));
  const [call, setCall] = useState<ComposedCall | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const senderOk = checkAddress(sender).ok;

  async function build() {
    setBusy(true);
    setCall(null);
    setRefused(null);
    try {
      const body: Record<string, unknown> = { action: action.id as ActionId, sender, jobId: job.jobId };
      if (action.id === "assign_job" || action.id === "set_validator") body.agentId = Number(agentId);
      if (action.id === "submit_result") body.resultHash = resultHash;
      if (action.id === "fund_job") body.amountMicro = Number(amount);
      setCall(await compose(body));
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsAgent = action.id === "assign_job" || action.id === "set_validator";
  const needsHash = action.id === "submit_result";
  const needsAmount = action.id === "fund_job";
  const isVerdict = action.id === "validation_response";
  const ready =
    senderOk &&
    (!needsAgent || Number(agentId) > 0 || action.id === "set_validator") &&
    (!needsHash || /^(0x)?[0-9a-fA-F]{64}$/.test(resultHash.trim())) &&
    (!needsAmount || Number(amount) > 0);

  return (
    <div className="rounded-lg border border-black/[0.08] px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-neutral-900">{action.label}</span>
        <span className="font-mono text-[11.5px] text-neutral-400">{action.signature}</span>
        {action.movesMoney && (
          <span className="rounded bg-orange-50 px-1.5 py-px text-[10.5px] font-semibold text-accent">
            moves {assetName}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">{action.what}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
        <span className="font-medium text-neutral-700">Who may call it:</span> {action.who}
        {action.whoAddress && (
          <>
            {" — "}
            <a
              href={peraAddress(action.whoAddress)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11.5px] underline underline-offset-2 hover:text-accent"
            >
              {shortAddr(action.whoAddress)}
            </a>
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400">
            Sender
          </span>
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value.trim())}
            spellCheck={false}
            className={cn(
              "mt-1 w-full rounded-md border bg-white px-2 py-1.5 font-mono text-[11.5px] outline-none",
              sender && !senderOk ? "border-rose-300" : "border-black/10 focus:border-neutral-400"
            )}
          />
        </label>

        {needsAgent && (
          <label>
            <span className="block text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400">
              Agent id
            </span>
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder={action.id === "set_validator" ? "0 clears it" : "1"}
              className="tnum mt-1 w-24 rounded-md border border-black/10 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-neutral-400"
            />
          </label>
        )}

        {needsAmount && (
          <label>
            <span className="block text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400">
              Base units of asset {assetId}
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="tnum mt-1 w-40 rounded-md border border-black/10 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-neutral-400"
            />
          </label>
        )}

        {needsHash && (
          <label className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400">
              Result sha256, 64 hex characters
            </span>
            <input
              value={resultHash}
              onChange={(e) => setResultHash(e.target.value.trim())}
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 font-mono text-[11.5px] outline-none focus:border-neutral-400"
            />
          </label>
        )}
      </div>

      {needsAmount && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-400">
          Base units, six decimals — {unitsFmt(Number(amount) || 0)} {assetName}. The transfer goes to the
          app&rsquo;s own account <span className="font-mono">{shortAddr(appAddress)}</span> as transaction 0 of
          a two-transaction group, and the contract reads the amount off it rather than off an argument.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isVerdict ? (
          <>
            <VerdictButton
              label="Compose: passed"
              busy={busy}
              disabled={!senderOk}
              onClick={() => void buildVerdict(true)}
            />
            <VerdictButton
              label="Compose: failed"
              busy={busy}
              disabled={!senderOk}
              tone="bad"
              onClick={() => void buildVerdict(false)}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => void build()}
            disabled={!ready || busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors",
              ready && !busy ? "bg-neutral-900 hover:bg-neutral-800" : "cursor-not-allowed bg-neutral-300"
            )}
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            Build the unsigned transaction
          </button>
        )}
        <span className="text-[11.5px] text-neutral-400">Composed only. Nothing is signed or submitted.</span>
      </div>

      {refused && (
        <div className="mt-3">
          <ComposeRefused message={refused} />
        </div>
      )}
      {call && (
        <div className="mt-3">
          <UnsignedCall call={call} />
        </div>
      )}
    </div>
  );

  async function buildVerdict(passed: boolean) {
    setBusy(true);
    setCall(null);
    setRefused(null);
    try {
      setCall(
        await compose({ action: "validation_response", sender, jobId: job.jobId, passed })
      );
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
}

function VerdictButton({
  label,
  onClick,
  busy,
  disabled,
  tone = "ok",
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  tone?: "ok" | "bad";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors",
        disabled || busy
          ? "cursor-not-allowed bg-neutral-300"
          : tone === "bad"
            ? "bg-rose-600 hover:bg-rose-700"
            : "bg-neutral-900 hover:bg-neutral-800"
      )}
    >
      {busy && <Loader2 size={11} className="animate-spin" />}
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  title,
  mono,
  link,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
  link?: string;
}) {
  const body = (
    <span className={cn("break-all", mono && "font-mono text-[11.5px]")} title={title}>
      {mono && value.length > 24 ? shortAddr(value) : value}
    </span>
  );
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400">{label}</div>
      <div className="mt-0.5 text-[12.5px] text-neutral-700">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-accent"
          >
            {body}
            <ArrowUpRight size={10} />
          </a>
        ) : (
          body
        )}
      </div>
    </div>
  );
}
