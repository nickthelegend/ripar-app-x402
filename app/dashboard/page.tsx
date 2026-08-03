import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <AppShell />;
}
