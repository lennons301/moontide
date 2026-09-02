"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { formatDate } from "@/components/admin/format-date";
import { PillGroup } from "@/components/admin/pill-group";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  PlainHeader,
  SortableHead,
  SortHeader,
} from "@/components/admin/table-headers";
import { useTableControls } from "@/components/admin/use-table-controls";

interface Bundle {
  id: number;
  customerEmail: string;
  creditsTotal: number;
  creditsRemaining: number;
  stripePaymentId: string;
  purchasedAt: string;
  expiresAt: string;
  status: string;
  emailSent: boolean;
}

type StatusFilter = "all" | "active" | "expired" | "exhausted";

export default function BundlesPage() {
  const [allBundles, setAllBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expiringSoon, setExpiringSoon] = useState(false);

  const fetchBundles = useCallback(async () => {
    const res = await fetch("/api/admin/bundles");
    const data = await res.json();
    setAllBundles(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

  const filters = useMemo(() => {
    const map: Record<string, (b: Bundle) => boolean> = {};
    if (statusFilter !== "all") {
      map.status = (b) => b.status === statusFilter;
    }
    if (expiringSoon) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 14);
      const cutoffIso = cutoff.toISOString();
      map.expiring = (b) => b.status === "active" && b.expiresAt < cutoffIso;
    }
    return map;
  }, [statusFilter, expiringSoon]);

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<Bundle>({
      rows: allBundles,
      sortKeys: {
        customer: (b) => b.customerEmail,
        purchased: (b) => b.purchasedAt,
        expires: (b) => b.expiresAt,
        used: (b) => b.creditsTotal - b.creditsRemaining,
      },
      searchFields: (b) => [b.customerEmail],
      filters,
      defaultSort: { key: "expires", direction: "asc" },
    });

  async function handleResendEmail(bundleId: number) {
    const res = await fetch("/api/admin/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bundle", id: bundleId }),
    });
    if (res.ok) {
      await fetchBundles();
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bundles
      </h1>

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search customer email..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "exhausted", label: "Exhausted" },
          ]}
        />
        <button
          type="button"
          onClick={() => setExpiringSoon((v) => !v)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            expiringSoon
              ? "bg-bright-orange text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          Expiring soon
        </button>
      </AdminTableToolbar>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <SortableHead sort={sort} toggleSort={toggleSort}>
            <SortHeader label="Customer" sortKey="customer" />
            <SortHeader label="Purchased" sortKey="purchased" />
            <SortHeader label="Expires" sortKey="expires" />
            <SortHeader label="Credits used" sortKey="used" />
            <PlainHeader label="Status" />
          </SortableHead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  {allBundles.length === 0
                    ? "No bundles yet."
                    : "No bundles match the current filters."}
                </td>
              </tr>
            ) : (
              rows.map((bundle) => (
                <tr key={bundle.id} className="hover:bg-ocean-light-blue/10">
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {bundle.customerEmail}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(bundle.purchasedAt)}
                  </td>
                  <td className="px-4 py-3">{formatDate(bundle.expiresAt)}</td>
                  <td className="px-4 py-3">
                    {bundle.creditsTotal - bundle.creditsRemaining}/
                    {bundle.creditsTotal}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={bundle.status} />
                    {!bundle.emailSent && (
                      <button
                        type="button"
                        onClick={() => handleResendEmail(bundle.id)}
                        className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange hover:bg-bright-orange/30 transition-colors cursor-pointer"
                      >
                        resend email
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
