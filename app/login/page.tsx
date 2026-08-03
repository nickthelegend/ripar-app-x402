import { AuthPanel } from "@/components/auth-panel";
import { DashboardPreview } from "@/components/dashboard-preview";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-[#f5f5f5] p-3 sm:p-4">
      <div className="grid min-h-[calc(100dvh-24px)] overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:grid-cols-2">
        {/* left — auth */}
        <div className="relative">
          <AuthPanel />
        </div>

        {/* right — product preview */}
        <div className="relative m-3 hidden overflow-hidden rounded-[22px] bg-[#0a0a0a] lg:block">
          <DashboardPreview />
        </div>
      </div>
    </main>
  );
}
