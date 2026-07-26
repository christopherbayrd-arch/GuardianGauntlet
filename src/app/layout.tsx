import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardian Gauntlet",
  description:
    "Guardian Pharmacy's live question game — scan, answer, and see how the room voted.",
};

export const viewport: Viewport = {
  themeColor: "#101f3a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
