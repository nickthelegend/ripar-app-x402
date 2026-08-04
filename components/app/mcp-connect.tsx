"use client";

import { useState } from "react";
import { Check, Link2, Loader2, Unplug } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/app-data";
import { introspect, type McpManifest } from "@/lib/mcp-tools";
import { connectServer, disconnectServer, useMcpServers, type McpServer } from "@/lib/mcp-servers";

/**
 * Attach an MCP server, then choose which of the tools it reports should reach
 * the palette. Introspection is mocked; everything after it — the picking, the
 * enabled set, detaching — is the real, persisted flow.
 */
export function McpConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const servers = useMcpServers();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manifest, setManifest] = useState<McpManifest | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // An already-attached server is edited rather than re-handshaken, so the
  // button says what it will do and the enabled set starts where it is.
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  function reset() {
    setUrl("");
    setErr(null);
    setBusy(false);
    setManifest(null);
    setPicked([]);
    setEditing(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function read() {
    if (!url.trim()) return setErr("Enter the server URL to attach.");
    setBusy(true);
    setErr(null);
    try {
      const found = await introspect(url);
      const already = servers.find((s) => s.id === found.id);
      setManifest(found);
      setEditing(!!already);
      setPicked(already ? already.enabled : found.tools.map((t) => t.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that server's tools.");
    } finally {
      setBusy(false);
    }
  }

  function edit(server: McpServer) {
    setUrl(server.url);
    setManifest({ id: server.id, url: server.url, label: server.label, tools: server.tools });
    setPicked(server.enabled);
    setEditing(true);
    setErr(null);
  }

  function detach(server: McpServer) {
    disconnectServer(server.id);
    if (manifest?.id === server.id) reset();
    toast(`Detached ${server.label}`);
  }

  function save() {
    if (!manifest || picked.length === 0) return;
    connectServer({
      id: manifest.id,
      url: manifest.url,
      label: manifest.label,
      tools: manifest.tools,
      enabled: picked,
      connectedAt: new Date().toISOString(),
    });
    toast(
      `${editing ? "Updated" : "Attached"} ${manifest.label} · ${picked.length} tool${picked.length === 1 ? "" : "s"} enabled`,
      "success"
    );
    close();
  }

  const allPicked = !!manifest && picked.length === manifest.tools.length;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Connect an MCP server"
      description="Attach a server by URL, then pick which of its tools appear in the palette."
      className="max-w-lg"
    >
      <div className="space-y-5">
        {servers.length > 0 && (
          <div>
            <h3 className="text-[12.5px] font-medium text-neutral-700">Attached</h3>
            <ul className="mt-2 space-y-1.5">
              {servers.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-black/[0.08] px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="truncate text-[13px] font-medium text-neutral-900">{s.label}</span>
                      <span className="text-[12px] text-emerald-700">Connected</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-neutral-400">{s.url}</span>
                  </span>
                  <span className="tnum text-[12px] text-neutral-500">
                    {s.enabled.length}/{s.tools.length} enabled
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => edit(s)}
                      className="rounded-md px-2 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-black/[0.04] hover:text-neutral-900"
                    >
                      Edit tools
                    </button>
                    <button
                      type="button"
                      onClick={() => detach(s)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <Unplug size={12} /> Detach
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="block">
            <span className="text-[12.5px] font-medium text-neutral-700">Server URL</span>
            <div className="mt-1.5 flex gap-2">
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void read();
                  }
                }}
                placeholder="https://mcp.linear.app/sse"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-2 font-mono text-[12.5px] outline-none transition-colors placeholder:font-sans placeholder:text-neutral-400 focus:border-neutral-400"
              />
              <button
                type="button"
                onClick={() => void read()}
                disabled={busy}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors",
                  busy ? "cursor-not-allowed bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
                )}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                {busy ? "Reading…" : "Read tools"}
              </button>
            </div>
          </label>
          {err ? (
            <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
              {err}
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-400">
              Try mcp.linear.app, mcp.notion.com or mcp.stripe.com — any https host answers with a
              manifest in this preview.
            </p>
          )}
        </div>

        {busy && !manifest && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-black/12 px-3 py-6 text-[12.5px] text-neutral-500">
            <Loader2 size={14} className="animate-spin text-neutral-400" />
            Reading the tool manifest…
          </div>
        )}

        {manifest && (
          <div className="rounded-xl border border-black/[0.09]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-black/[0.07] px-3 py-2.5">
              <span className="text-[13px] font-medium text-neutral-900">{manifest.label}</span>
              <span className="tnum text-[12px] text-neutral-400">
                {manifest.tools.length} tools reported
              </span>
              <button
                type="button"
                onClick={() => setPicked(allPicked ? [] : manifest.tools.map((t) => t.id))}
                className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-black/[0.04] hover:text-neutral-900"
              >
                {allPicked ? "Clear all" : "Select all"}
              </button>
            </div>
            <ul className="max-h-[220px] overflow-y-auto p-1.5">
              {manifest.tools.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/[0.03]">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((p) => (on ? p.filter((id) => id !== t.id) : [...p, t.id]))
                        }
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#ff6b2b]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-medium text-neutral-900">{t.name}</span>
                          <span className="ml-auto shrink-0 text-[11.5px] text-neutral-400">
                            {t.price ? <span className="tnum">{usd(t.price, 3)} USDC</span> : "free"}
                          </span>
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-neutral-400">{t.id}</span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-neutral-500">
                          {t.description}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="text-[12px] leading-relaxed text-neutral-400">
          Introspection is mocked in this preview — no request leaves the browser, and the tools
          above are sample data. Enabled tools are stored on this device only.
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:text-neutral-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!manifest || picked.length === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors",
              !manifest || picked.length === 0
                ? "cursor-not-allowed bg-neutral-300"
                : "bg-neutral-900 hover:bg-neutral-800"
            )}
          >
            <Check size={13} />
            {manifest
              ? `${editing ? "Save" : "Enable"} ${picked.length || "no"} tool${picked.length === 1 ? "" : "s"}`
              : "Enable tools"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
