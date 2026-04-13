import type { Metadata } from "next";

export const metadata: Metadata = { title: "Six Class Bundle — Moontide" };

export default function BundleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
