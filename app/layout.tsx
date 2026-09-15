import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attune — relationship memory, gently organized",
  description: "A calm, private place to remember the details that help you care well.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
