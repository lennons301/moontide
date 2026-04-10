import Link from "next/link";

const footerLinks = [
  { label: "Prenatal", href: "/classes/prenatal" },
  { label: "Postnatal", href: "/classes/postnatal" },
  { label: "Baby Massage", href: "/classes/baby-yoga" },
  { label: "Private", href: "/private" },
  { label: "T&Cs", href: "/terms" },
];

export function Footer({ instagramUrl }: { instagramUrl?: string }) {
  return (
    <footer className="border-t border-driftwood bg-white py-8 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-deep-ocean">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-lunar-gold transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-lunar-gold transition-colors"
            >
              Instagram
            </a>
          )}
        </nav>
        <p className="mt-4 text-xs text-shallow-water">
          &copy; {new Date().getFullYear()} Moontide
        </p>
      </div>
    </footer>
  );
}
