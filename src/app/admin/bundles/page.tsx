"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
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

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-deep-tide-blue text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-deep-ocean hover:text-deep-tide-blue"
    >
      {label}
      {active && (
        <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      active: "bg-seagrass/20 text-seagrass",
      expired: "bg-red-100 text-red-700",
      exhausted: "bg-ocean-light-blue/20 text-ocean-light-blue",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  }

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
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Customer"
                  sortKey="customer"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("customer")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Purchased"
                  sortKey="purchased"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("purchased")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Expires"
                  sortKey="expires"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("expires")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Credits used"
                  sortKey="used"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("used")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Status
              </th>
            </tr>
          </thead>
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
                    {statusBadge(bundle.status)}
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
