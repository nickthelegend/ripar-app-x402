import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { StoreSync } from "@/components/store-sync";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // Workspace, not marketing — keep it out of search results entirely.
  robots: { index: false, follow: false, nocache: true },
  title: {
    default: "Ripar",
    template: "%s · Ripar",
  },
  description: "The end-to-end AI ecosystem — build and ship AI apps, agents, and workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <ToastProvider>
          {children}
          <StoreSync />
        </ToastProvider>
      </body>
    </html>
  );
}
