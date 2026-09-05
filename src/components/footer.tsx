import Link from "next/link";
import type { CatalogueClass } from "@/lib/content/services";

const fixedFooterLinks = [
  { label: "Private", href: "/private" },
  { label: "T&Cs", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

export function Footer({
  instagramUrl,
  classes,
}: {
  instagramUrl?: string;
  classes: CatalogueClass[];
}) {
  const footerLinks = [
    ...classes.map(({ slug, title }) => ({
      label: title,
      href: `/classes/${slug}`,
    })),
    ...fixedFooterLinks,
  ];

  return (
    <footer className="border-t border-soft-moonstone bg-white py-8 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-deep-ocean">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-bright-orange transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-bright-orange transition-colors"
            >
              Instagram
            </a>
          )}
        </nav>
        <p className="mt-4 text-xs text-ocean-light-blue">
          &copy; {new Date().getFullYear()} Moontide
        </p>
      </div>
    </footer>
  );
}
