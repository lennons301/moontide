"use client";

import Link from "next/link";
import { useState } from "react";
import { MobileMenu } from "./mobile-menu";

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-dawn-light border-b border-soft-moonstone">
      <div className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col gap-[5px] p-2"
          aria-label="Open menu"
        >
          <span className="block w-5 h-0.5 bg-deep-tide-blue" />
          <span className="block w-5 h-0.5 bg-deep-tide-blue" />
          <span className="block w-5 h-0.5 bg-deep-tide-blue" />
        </button>
        <Link
          href="/"
          className="text-lg font-semibold tracking-widest text-deep-tide-blue"
        >
          MOONTIDE
        </Link>
      </div>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
