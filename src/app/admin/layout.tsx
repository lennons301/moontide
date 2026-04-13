import Link from "next/link";

const adminLinks = [
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Messages", href: "/admin/messages" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-foam-white">
      <nav className="bg-deep-current text-foam-white px-6 py-3">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="font-semibold tracking-wider text-sm">
            MOONTIDE ADMIN
          </Link>
          <div className="flex gap-4 text-sm">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-lunar-gold transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  );
}
