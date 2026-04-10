"use client";

import Link from "next/link";
import { useState } from "react";

const menuLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  {
    label: "Classes",
    children: [
      { label: "Prenatal Yoga", href: "/classes/prenatal" },
      { label: "Postnatal Yoga", href: "/classes/postnatal" },
      { label: "Baby Yoga & Massage", href: "/classes/baby-yoga" },
      { label: "Vinyasa Flow", href: "/classes/vinyasa" },
    ],
  },
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
  const [classesOpen, setClassesOpen] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-driftwood">
      <div className="flex items-center justify-between px-6 py-4 border-b border-driftwood">
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-deep-current"
          aria-label="Close menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>Close menu</title>
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>
        <span className="text-lg font-semibold tracking-widest text-deep-current">
          MOONTIDE
        </span>
      </div>
      <nav className="px-6 py-8">
        <ul className="space-y-4">
          {menuLinks.map((item) => (
            <li key={item.label}>
              {"href" in item ? (
                <Link
                  href={item.href!}
                  onClick={onClose}
                  className="block text-lg text-deep-ocean hover:text-lunar-gold transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setClassesOpen(!classesOpen)}
                    className="flex items-center gap-2 text-lg text-deep-ocean hover:text-lunar-gold transition-colors"
                  >
                    {item.label}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`transition-transform ${classesOpen ? "rotate-180" : ""}`}
                    >
                      <title>Toggle classes submenu</title>
                      <polyline points="2,4 6,8 10,4" />
                    </svg>
                  </button>
                  {classesOpen && (
                    <ul className="mt-2 ml-4 space-y-2">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onClose}
                            className="block text-base text-deep-ocean/70 hover:text-lunar-gold transition-colors"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
