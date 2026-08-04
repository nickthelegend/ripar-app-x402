"use client";

import { compact, percent, usd } from "@/lib/mission/format";
import { useEconomySnapshot } from "@/lib/mission/use-economy";
import { Glass, Label, Odometer } from "./bits";

/**
 * The left panel: four numbers and the one that matters most, larger.
 *
 * Everything counts toward its target rather than snapping, so the panel reads
 * as an instrument tracking something continuous instead of a table being
 * refreshed.
 */
export function MissionSummary() {
  const s = useEconomySnapshot();

  return (
    <Glass className="w-full p-5 sm:p-6">
      {/* No panel title. The first line already says what this is, and a header
          above it would only be there because panels usually have headers. */}
      <div>
        <Label>Today&rsquo;s revenue</Label>
        <div className="mt-2 flex items-baseline gap-1">
          <Odometer
            value={s.revenue}
            format={usd}
            ease={420}
            className="font-plex text-[32px] leading-none tracking-[-0.03em] text-gold sm:text-[38px]"
          />
        </div>
        <div className="mt-2.5 font-plex tnum text-[10.5px] text-haze">
          <Odometer value={s.perMinute} format={(n) => String(Math.round(n))} ease={300} /> settled in the last
          minute
        </div>
      </div>

      <div className="mt-6 space-y-px border-t border-white/[0.06] pt-2">
        <Row label="Transactions" value={<Odometer value={s.txns} format={compact} />} />
        <Row label="Settlement rate" value={<Odometer value={s.settlementRate} format={(n) => percent(n)} ease={500} />} />
        <Row label="Healthy agents" value={`${s.healthy} / ${s.agents}`} />
        {/* Ticks up the instant a First Light lands, so the ceremony has a number. */}
        <Row label="Earning" value={`${s.lit} / ${s.agents}`} accent />
      </div>
    </Glass>
  );
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-[7px]">
      <Label className="normal-case tracking-[0.06em] text-[10.5px] text-haze/85">{label}</Label>
      <span className={`font-plex tnum text-[12px] ${accent ? "text-gold/90" : "text-frost/90"}`}>{value}</span>
    </div>
  );
}
