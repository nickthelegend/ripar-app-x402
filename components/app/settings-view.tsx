"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, KeyRound, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/app-data";
import { ADDRESS_LENGTH, checkAddress, shortAddress } from "@/lib/algorand-address";
import { maskKey, mintApiKey, saveSettings, useSettings, type ApiKey, type SpendCaps } from "@/lib/settings";
import { schemaState, type SchemaState } from "@/lib/db";
import { CopyButton, PageHead, Sheet, SortHeader } from "./bits";

export function SettingsView() {
  const s = useSettings();

  // Whether anything on this page actually persists.
  //
  // The data layer degrades to local-only when the migration has not been
  // applied — the right fallback, but silent: an edit looks saved and the write
  // is dropped. Ask the project once and say which mode this is.
  const [schema, setSchema] = useState<SchemaState>("unknown");
  useEffect(() => {
    let live = true;
    void schemaState().then((v) => live && setSchema(v));
    return () => {
      live = false;
    };
  }, []);

  // Each section holds a draft. Keying on the saved value resets that draft
  // when the store changes — which is both how the stored settings arrive after
  // hydration and how a save is confirmed — with no effect syncing the two.
  return (
    <>
      {schema === "missing" ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12.5px] leading-relaxed text-amber-900">
            <span className="font-medium">Nothing on this page is being saved to a database.</span>{" "}
            The Supabase project answers, but its tables are not there — the migration in{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11.5px]">
              supabase/migrations/0001_init.sql
            </code>{" "}
            has not been applied. Edits are kept in this browser and will not follow you to another
            device. Apply the migration to make them durable.
          </p>
        </div>
      ) : null}
      <PageHead
        title="Settings"
        subtitle="Who you are, where settlement pays, what you intend this workspace to spend, and the keys that can call it."
      />
      <div className="space-y-4">
        <ProfileSection key={`${s.name}|${s.email}|${s.org}`} saved={{ name: s.name, email: s.email, org: s.org }} />
        <PayoutSection key={s.payout} saved={s.payout} />
        <CapsSection key={`${s.caps.enabled}|${s.caps.perCall}|${s.caps.daily}|${s.caps.monthly}`} saved={s.caps} />
        <KeysSection />
      </div>
    </>
  );
}

/* ── shared shape ─────────────────────────────────────────────────────────── */

function Section({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Sheet>
      <div className="border-b border-black/[0.07] px-5 py-4">
        <h2 className="text-[14.5px] font-semibold tracking-tight text-neutral-900">{title}</h2>
        <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-neutral-500">{description}</p>
      </div>
      <div className="px-5 py-5">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.07] bg-neutral-50/60 px-5 py-3">
          {footer}
        </div>
      )}
    </Sheet>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-neutral-700">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-[12px] leading-relaxed text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] leading-relaxed text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass = (bad?: boolean) =>
  cn(
    "mt-1.5 w-full rounded-lg border px-3 py-2 text-[13.5px] outline-none transition-colors placeholder:text-neutral-400",
    bad ? "border-rose-300 focus:border-rose-400" : "border-black/10 focus:border-neutral-400"
  );

function SaveButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors",
        disabled ? "cursor-not-allowed bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
      )}
    >
      {children}
    </button>
  );
}

/* ── profile ──────────────────────────────────────────────────────────────── */

function ProfileSection({ saved }: { saved: { name: string; email: string; org: string } }) {
  const [draft, setDraft] = useState(saved);
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useToast();

  const dirty = draft.name !== saved.name || draft.email !== saved.email || draft.org !== saved.org;

  function save() {
    if (!draft.name.trim()) return setErr("A name is needed — it signs the jobs you post.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return setErr("That does not look like an email address.");
    setErr(null);
    saveSettings({ name: draft.name.trim(), email: draft.email.trim(), org: draft.org.trim() });
    toast("Profile saved", "success");
  }

  return (
    <Section
      title="Profile"
      description="Shown on the jobs you post and the agents you publish."
      footer={
        <>
          <SaveButton disabled={!dirty} onClick={save}>Save profile</SaveButton>
          <span className="text-[12px] text-neutral-400">{dirty ? "Unsaved changes" : "Up to date"}</span>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={err && !draft.name.trim() ? err : null}>
          <input
            value={draft.name}
            onChange={(e) => { setDraft((d) => ({ ...d, name: e.target.value })); setErr(null); }}
            className={inputClass(!!err && !draft.name.trim())}
          />
        </Field>
        <Field label="Email" error={err && draft.name.trim() ? err : null}>
          <input
            value={draft.email}
            onChange={(e) => { setDraft((d) => ({ ...d, email: e.target.value })); setErr(null); }}
            type="email"
            className={inputClass(!!err && !!draft.name.trim())}
          />
        </Field>
        <Field label="Workspace" hint="Appears beside your endpoints on the Bazaar.">
          <input
            value={draft.org}
            onChange={(e) => setDraft((d) => ({ ...d, org: e.target.value }))}
            className={inputClass()}
          />
        </Field>
      </div>
    </Section>
  );
}

/* ── payout address ───────────────────────────────────────────────────────── */

function PayoutSection({ saved }: { saved: string }) {
  const [draft, setDraft] = useState(saved);
  const { toast } = useToast();

  const check = useMemo(() => checkAddress(draft), [draft]);
  const dirty = draft.trim() !== saved;

  return (
    <Section
      title="Payout address"
      description="Every paid call settles from the caller straight to this address. Ripar never takes custody, which also means a wrong address cannot be undone — so it is checked properly before it can be saved."
      footer={
        <>
          <SaveButton
            disabled={!dirty || !check.ok}
            onClick={() => {
              saveSettings({ payout: draft.trim() });
              toast("Payout address saved", "success");
            }}
          >
            Save address
          </SaveButton>
          <span className="text-[12px] text-neutral-400">
            {dirty ? (check.ok ? "Valid — ready to save" : "Fix the address to save") : "Up to date"}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[12px] text-neutral-500">{shortAddress(saved)}</span>
            <CopyButton text={saved} label="Copy address" what="payout address" />
          </span>
        </>
      }
    >
      <Field
        label="Algorand address"
        hint={
          <>
            {ADDRESS_LENGTH} characters of base32 (A–Z, 2–7). The last four encode a SHA-512/256 checksum
            over the public key, and it is verified here in the browser — a transposed character is caught
            before it is ever saved.
          </>
        }
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!check.ok}
          className={cn(
            "mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-[12.5px] outline-none transition-colors",
            check.ok ? "border-black/10 focus:border-neutral-400" : "border-rose-300 focus:border-rose-400"
          )}
        />
      </Field>

      <p
        role={check.ok ? undefined : "alert"}
        className={cn(
          "mt-2 inline-flex items-start gap-1.5 text-[12.5px] font-medium",
          check.ok ? "text-emerald-700" : "text-rose-600"
        )}
      >
        <span className={cn("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", check.ok ? "bg-emerald-500" : "bg-rose-500")} />
        {check.ok ? (
          <span>
            Valid address · checksum verified
            <span className="tnum ml-1.5 font-normal text-neutral-400">{draft.trim().length}/{ADDRESS_LENGTH}</span>
          </span>
        ) : (
          <span className="font-normal">{check.message}</span>
        )}
      </p>
    </Section>
  );
}

/* ── spend caps ───────────────────────────────────────────────────────────── */

type CapDraft = { enabled: boolean; perCall: string; daily: string; monthly: string };

// Worded as intent, not as enforcement: nothing in this app reads these numbers
// before a payment, because this app never signs one. See the notice below.
const CAP_FIELDS: { key: keyof Omit<CapDraft, "enabled">; label: string; hint: string }[] = [
  { key: "perCall", label: "Per call", hint: "The most a single quote should ever be." },
  { key: "daily", label: "Per day", hint: "The most a rolling 24 hours should add up to." },
  { key: "monthly", label: "Per calendar month", hint: "The most a calendar month should add up to." },
];

function CapsSection({ saved }: { saved: SpendCaps }) {
  const [draft, setDraft] = useState<CapDraft>(() => ({
    enabled: saved.enabled,
    perCall: String(saved.perCall),
    daily: String(saved.daily),
    monthly: String(saved.monthly),
  }));
  const [err, setErr] = useState<Partial<Record<keyof CapDraft, string>>>({});
  const { toast } = useToast();

  const dirty =
    draft.enabled !== saved.enabled ||
    draft.perCall !== String(saved.perCall) ||
    draft.daily !== String(saved.daily) ||
    draft.monthly !== String(saved.monthly);

  function save() {
    const next = { perCall: Number(draft.perCall), daily: Number(draft.daily), monthly: Number(draft.monthly) };
    const found: Partial<Record<keyof CapDraft, string>> = {};
    for (const f of CAP_FIELDS) {
      const v = next[f.key];
      if (!Number.isFinite(v) || v <= 0) found[f.key] = "Must be a number greater than zero.";
    }
    // A ceiling below the one beneath it can never bind, so it is a mistake.
    if (!found.daily && !found.perCall && next.daily < next.perCall) found.daily = "The daily cap cannot be below the per-call cap.";
    if (!found.monthly && !found.daily && next.monthly < next.daily) found.monthly = "The monthly cap cannot be below the daily cap.";
    if (Object.keys(found).length) return setErr(found);

    setErr({});
    saveSettings({ caps: { enabled: draft.enabled, ...next } });
    toast(draft.enabled ? "Spend caps saved on this device" : "Spend caps saved and turned off", "success");
  }

  return (
    <Section
      title="Spend caps"
      description="What you intend this workspace to be allowed to pay out to other endpoints and agents. Recorded as a preference — read the note below before relying on it."
      footer={
        <>
          <SaveButton disabled={!dirty} onClick={save}>Save caps</SaveButton>
          <span className="text-[12px] text-neutral-400">
            {draft.enabled
              ? `Intending a ${usd(Number(draft.perCall) || 0, 2)} USDC ceiling per call — not enforced`
              : "No caps set"}
          </span>
        </>
      }
    >
      {/* The control used to say a quote above a cap was refused before payment.
          Nothing does that: these numbers live in this browser's localStorage and
          no code path reads them, because this app does not sign outbound
          payments — a caller's own wallet does, wherever it runs. Saying so is
          the only honest option short of building the spender that would obey
          them. */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-[12.5px] leading-relaxed text-amber-900">
          <span className="font-medium">These caps are not enforced yet.</span> They are stored on
          this device as a preference and nothing consults them: no payment is signed from this app,
          so there is no request path to refuse. Treat them as a note to yourself, not as a limit
          that will stop a runaway loop.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-black/[0.08] px-3.5 py-3">
        <span>
          <span className="block text-[13px] font-medium text-neutral-900">Record caps</span>
          <span className="block text-[12px] text-neutral-500">Turning this off clears the intended ceilings below.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          aria-label="Record spend caps"
          onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
          className={cn(
            "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors",
            draft.enabled ? "bg-accent" : "bg-neutral-300"
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all",
              draft.enabled ? "left-[19px]" : "left-[3px]"
            )}
          />
        </button>
      </div>

      <div className={cn("mt-4 grid gap-4 sm:grid-cols-3", !draft.enabled && "opacity-50")}>
        {CAP_FIELDS.map((f) => (
          <Field key={f.key} label={`${f.label} (USDC)`} hint={f.hint} error={err[f.key]}>
            <input
              value={draft[f.key]}
              onChange={(e) => { setDraft((d) => ({ ...d, [f.key]: e.target.value })); setErr((p) => ({ ...p, [f.key]: undefined })); }}
              inputMode="decimal"
              disabled={!draft.enabled}
              className={cn(inputClass(!!err[f.key]), "tnum")}
            />
          </Field>
        ))}
      </div>
    </Section>
  );
}

/* ── API keys ─────────────────────────────────────────────────────────────── */

type KeyField = "name" | "created" | "lastUsed";

function KeysSection() {
  const s = useSettings();
  const [sort, setSort] = useState<{ field: KeyField; dir: "asc" | "desc" }>({ field: "name", dir: "asc" });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [secret, setSecret] = useState<{ key: ApiKey; value: string } | null>(null);
  const { toast } = useToast();

  const rows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...s.keys].sort((a, b) => String(a[sort.field] ?? "").localeCompare(String(b[sort.field] ?? "")) * dir);
  }, [s.keys, sort]);

  const toggleSort = (field: KeyField) =>
    setSort((p) => (p.field === field ? { field, dir: p.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }));

  function revoke(key: ApiKey) {
    saveSettings({ keys: s.keys.filter((k) => k.id !== key.id) });
    setRevoking(null);
    toast(`Revoked ${key.name} — calls using it now get 401`);
  }

  return (
    <Section
      title="API keys"
      description="A key authenticates you to Ripar's own API — creating endpoints, posting jobs, reading receipts. It is not what pays for a call; that is the payout address and the caller's own wallet."
      footer={
        <>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Plus size={14} /> Create key
          </button>
          <span className="text-[12px] text-neutral-400">
            Keys are generated in this browser and stored on this device only.
          </span>
        </>
      }
    >
      {s.keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/12 px-5 py-10 text-center">
          <p className="text-[13.5px] font-medium text-neutral-800">No keys</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-neutral-500">
            Nothing can call the Ripar API on your behalf until you create one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.08]">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead className="border-b border-black/[0.07] text-[12px]">
              <tr>
                <SortHeader label="Name" field="name" sort={sort} onSort={toggleSort} />
                <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Key</th>
                <SortHeader label="Created" field="created" sort={sort} onSort={toggleSort} />
                <SortHeader label="Last used" field="lastUsed" sort={sort} onSort={toggleSort} />
                <th scope="col" className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="border-b border-black/[0.05] last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-neutral-900">{k.name}</span>
                    <span className="block text-[11.5px] text-neutral-400">
                      {k.prefix === "rpk_live" ? "Live key" : "Test key"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500">{maskKey(k)}</td>
                  <td className="tnum px-3 py-2.5 text-neutral-600">{k.created}</td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {k.lastUsed ?? <span className="text-neutral-400">never used</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setRevoking(k)}
                      aria-label={`Revoke ${k.name}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <Trash2 size={12} /> Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-neutral-400">
        The full secret is shown once, at creation, and never again — Ripar keeps only the prefix and the
        last four characters, which is all that is needed to tell keys apart in this table.
      </p>

      <CreateKey
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(name, live) => {
          const { key, secret: value } = mintApiKey(name, live);
          saveSettings({ keys: [...s.keys, key] });
          setCreating(false);
          setSecret({ key, value });
        }}
      />

      <Modal
        open={!!secret}
        onClose={() => setSecret(null)}
        title="Copy your key now"
        description="This is the only time the full key is shown. Close this dialog and it is gone for good."
      >
        {secret && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[12.5px] leading-relaxed text-amber-900">
                Store it in your secret manager. If it is lost, revoke the key and create another — it
                cannot be recovered.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-black/[0.09] bg-neutral-50 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-neutral-800">{secret.value}</code>
              <CopyButton text={secret.value} what="API key" />
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => { setSecret(null); toast(`Created ${secret.key.name}`, "success"); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
              >
                <Check size={13} /> I have stored it
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name}?`}
        description="Anything still using this key starts getting 401 immediately. This cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setRevoking(null)} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => revoking && revoke(revoking)}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-rose-700"
          >
            Revoke key
          </button>
        </div>
      </Modal>
    </Section>
  );
}

function CreateKey({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, live: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [live, setLive] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return setErr("Name the key after where it will run, so it can be revoked without guessing.");
    onCreate(name, live);
    setName("");
    setErr(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Create API key" description="Shown once on creation, then masked everywhere.">
      <div className="space-y-4">
        <Field label="Name" error={err}>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(null); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Production server"
            className={inputClass(!!err)}
          />
        </Field>
        <fieldset>
          <legend className="text-[12.5px] font-medium text-neutral-700">Environment</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {[
              { on: true, label: "Live", hint: "Moves real USDC" },
              { on: false, label: "Test", hint: "TestNet only" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={live === o.on}
                onClick={() => setLive(o.on)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  live === o.on ? "border-accent bg-orange-50/60" : "border-black/10 hover:border-black/20"
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-900">
                  <KeyRound size={12} className={live === o.on ? "text-accent" : "text-neutral-400"} />
                  {o.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-neutral-500">{o.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900">
            Cancel
          </button>
          <button type="button" onClick={submit} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800">
            Create key
          </button>
        </div>
      </div>
    </Modal>
  );
}
