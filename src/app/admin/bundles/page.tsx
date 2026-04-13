"use client";

import { useCallback, useEffect, useState } from "react";

interface Bundle {
  id: number;
  customerEmail: string;
  creditsTotal: number;
  creditsRemaining: number;
  stripePaymentId: string;
  purchasedAt: string;
  expiresAt: string;
  status: string;
}

export default function BundlesPage() {
  const [bundleList, setBundleList] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBundles = useCallback(async () => {
    const res = await fetch("/api/admin/bundles");
    const data = await res.json();
    setBundleList(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bundles
      </h1>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light text-xs uppercase tracking-wider text-deep-ocean">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Purchased</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Status</th>
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
            ) : bundleList.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No bundles yet.
                </td>
              </tr>
            ) : (
              bundleList.map((bundle) => (
                <tr key={bundle.id} className="hover:bg-ocean-light-blue/10">
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {bundle.customerEmail}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(bundle.purchasedAt)}
                  </td>
                  <td className="px-4 py-3">{formatDate(bundle.expiresAt)}</td>
                  <td className="px-4 py-3">
                    {bundle.creditsRemaining}/{bundle.creditsTotal}
                  </td>
                  <td className="px-4 py-3">{statusBadge(bundle.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
