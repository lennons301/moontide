"use client";

import type React from "react";
import { Input } from "@/components/ui/input";

interface AdminTableToolbarProps {
  search: string;
  onSearchChange: (s: string) => void;
  searchPlaceholder?: string;
  showing: number;
  total: number;
  children?: React.ReactNode;
}

export function AdminTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  showing,
  total,
  children,
}: AdminTableToolbarProps) {
  return (
    <div className="mb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 sm:max-w-xs"
        />
        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
      {showing !== total && (
        <p className="mt-2 text-xs text-deep-ocean/60">
          Showing {showing} of {total}
        </p>
      )}
    </div>
  );
}
