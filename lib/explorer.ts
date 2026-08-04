import type { ChainNetwork } from "./real-data";

/**
 * Block-explorer links, per network.
 *
 * allo.info is MainNet-only, so every "verify" link in this app opened a
 * not-found page for a moment after the data layer started following the
 * agent's declared network (TestNet). A link that 404s is worse than no link:
 * it invites the reader to check, and then fails in a way that looks like the
 * transaction is not real.
 *
 * Lora covers both networks, so it is the default; allo.info is kept for
 * MainNet, where it is the better reader.
 */
export function txUrl(id: string, net: ChainNetwork): string {
  return net === "mainnet"
    ? `https://allo.info/tx/${id}`
    : `https://lora.algokit.io/testnet/transaction/${id}`;
}

export function accountUrl(address: string, net: ChainNetwork): string {
  return net === "mainnet"
    ? `https://allo.info/account/${address}`
    : `https://lora.algokit.io/testnet/account/${address}`;
}

/** "MainNet" / "TestNet" — for copy that names the chain to the reader. */
export function networkLabel(net: ChainNetwork): string {
  return net === "mainnet" ? "MainNet" : "TestNet";
}
