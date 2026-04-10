"use client";

import { useState } from "react";
import Link from "next/link";
import { MobileMenu } from "./mobile-menu";

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-foam-white/95 backdrop-blur-sm border-b border-driftwood">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-widest text-deep-current">
          MOONTIDE
        </Link>
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col gap-[5px] p-2"
          aria-label="Open menu"
        >
          <span className="block w-5 h-0.5 bg-deep-current" />
          <span className="block w-5 h-0.5 bg-deep-current" />
          <span className="block w-5 h-0.5 bg-deep-current" />
        </button>
      </div>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
