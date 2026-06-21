import type { Metadata } from "next";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "GossipGPT | Drop the drama into the group chat.",
  description: "Get honest, balanced, and hopeful advice from your AI friend group.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
