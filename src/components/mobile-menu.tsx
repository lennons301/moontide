"use client";

import Link from "next/link";

const menuLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Prenatal Yoga", href: "/classes/prenatal" },
  { label: "Postnatal Yoga", href: "/classes/postnatal" },
  { label: "Baby Yoga & Massage", href: "/classes/baby-yoga" },
  { label: "Vinyasa Flow", href: "/classes/vinyasa" },
  { label: "Coaching", href: "/coaching" },
  { label: "Community", href: "/community" },
  { label: "Private Classes", href: "/private" },
  { label: "Book a Class", href: "/book" },
  { label: "Contact", href: "/contact" },
];

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foam-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-driftwood">
        <span className="text-lg font-semibold tracking-widest text-deep-current">
          MOONTIDE
        </span>
        <button onClick={onClose} className="p-2 text-deep-current" aria-label="Close menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>
      </div>
      <nav className="px-6 py-8">
        <ul className="space-y-4">
          {menuLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={onClose}
                className="block text-lg text-deep-ocean hover:text-lunar-gold transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
