import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";

// Mission Control reads as an instrument, so every figure, label and canvas
// annotation is set in Plex Mono. Inter stays the app's voice everywhere else
// and still carries prose here.
const plex = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "The autonomous agent economy, settling live.",
};

export default function MissionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${plex.variable} bg-ink`} data-mission>
      {children}
    </div>
  );
}
