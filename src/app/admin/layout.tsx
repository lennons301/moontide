import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";

const adminLinks = [
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Messages", href: "/admin/messages" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactSubmissions)
    .where(eq(contactSubmissions.read, false));
  const unreadCount = rows[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-dawn-light">
      <nav className="bg-deep-tide-blue text-dawn-light px-6 py-3">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="font-semibold tracking-wider text-sm">
            MOONTIDE ADMIN
          </Link>
          <div className="flex gap-4 text-sm">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-bright-orange transition-colors"
              >
                {link.label}
                {link.label === "Messages" && unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-bright-orange px-2 py-0.5 text-xs font-semibold text-dawn-light">
                    {unreadCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  );
}
