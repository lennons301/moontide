"use client";

import { useState } from "react";
import { AdminAlert } from "@/components/admin/admin-alert";
import { mutateAdmin, useAdminResource } from "@/components/admin/admin-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildChangeSummary,
  buildPricingPayload,
  penceToPounds,
} from "@/lib/admin/pricing-changes";
import type { AdminPricingResponse } from "@/lib/admin/rows";

type ClassPrice = AdminPricingResponse["classes"][number];
type BundleConfigRow = AdminPricingResponse["bundleConfigs"][number];

const NO_PRICING: AdminPricingResponse = { classes: [], bundleConfigs: [] };

export default function PricingPage() {
  const {
    data: pricing,
    loading,
    error: loadError,
    refetch,
  } = useAdminResource<AdminPricingResponse>("/api/admin/pricing", NO_PRICING);
  const { classes, bundleConfigs } = pricing;
  const [classEdits, setClassEdits] = useState<Record<number, string>>({});
  const [eligibilityEdits, setEligibilityEdits] = useState<
    Record<number, boolean>
  >({});
  const [bundleEdits, setBundleEdits] = useState<
    Record<
      number,
      { priceInPence?: string; credits?: string; expiryDays?: string }
    >
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function reloadPricing() {
    setClassEdits({});
    setEligibilityEdits({});
    setBundleEdits({});
    await refetch();
  }

  function getClassDisplayPrice(c: ClassPrice) {
    return classEdits[c.id] ?? penceToPounds(c.priceInPence);
  }

  function getClassBundleEligible(c: ClassPrice) {
    return eligibilityEdits[c.id] ?? c.bundleEligible;
  }

  function getBundleDisplayValue(
    bc: BundleConfigRow,
    field: "priceInPence" | "credits" | "expiryDays",
  ) {
    const edit = bundleEdits[bc.id]?.[field];
    if (edit !== undefined) return edit;
    if (field === "priceInPence") return penceToPounds(bc.priceInPence);
    return String(bc[field]);
  }

  const rows = { classes, bundleConfigs };
  const edits = {
    classPrices: classEdits,
    classEligibility: eligibilityEdits,
    bundles: bundleEdits,
  };

  const changes = buildChangeSummary(rows, edits);
  const hasChanges = changes.length > 0;

  async function handleSave() {
    if (changes.length === 0) return;

    const confirmed = window.confirm(
      `Update pricing?\n\n${changes.join("\n")}\n\nChanges apply to new purchases only.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setSaveError(null);

    // Nothing between here and `setSaving(false)` may throw: reading a failure
    // body as JSON used to, and a 502 answering with HTML left the button
    // disabled until the page was reloaded.
    const result = await mutateAdmin("/api/admin/pricing", {
      method: "PUT",
      body: buildPricingPayload(rows, edits),
    });

    if (result.ok) {
      await reloadPricing();
    } else {
      setSaveError(result.error);
    }

    setSaving(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-deep-tide-blue">Pricing</h1>
      </div>

      <AdminAlert message={loadError} className="mb-4" />
      {loading && (
        <p className="mb-4 text-sm text-soft-moonstone">Loading...</p>
      )}

      {/* Class Prices */}
      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm mb-6">
        <div className="px-5 py-3 border-b border-soft-moonstone/20 bg-dawn-light">
          <h2 className="text-xs uppercase tracking-wider text-deep-ocean font-medium">
            Class Prices
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 text-xs uppercase tracking-wider text-deep-ocean">
            <tr>
              <th className="px-5 py-3">Class</th>
              <th className="px-5 py-3 w-36">Price</th>
              <th className="px-5 py-3 w-40">Bundle Eligible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {classes.map((c) => (
              <tr key={c.id} className="hover:bg-ocean-light-blue/10">
                <td className="px-5 py-3 font-medium text-deep-tide-blue">
                  {c.title}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-deep-ocean text-sm">£</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={getClassDisplayPrice(c)}
                      onChange={(e) =>
                        setClassEdits({ ...classEdits, [c.id]: e.target.value })
                      }
                      className="w-24 h-8"
                    />
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      id={`class-bundle-eligible-${c.id}`}
                      type="checkbox"
                      checked={getClassBundleEligible(c)}
                      onChange={(e) =>
                        setEligibilityEdits({
                          ...eligibilityEdits,
                          [c.id]: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-soft-moonstone text-bright-orange focus:ring-bright-orange"
                    />
                    <Label
                      htmlFor={`class-bundle-eligible-${c.id}`}
                      className="cursor-pointer text-deep-ocean/70 text-xs font-normal"
                    >
                      Bookable with a bundle
                    </Label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bundle Configuration */}
      {bundleConfigs.map((bc) => (
        <div
          key={bc.id}
          className="rounded-lg border border-soft-moonstone/30 bg-white shadow-sm mb-6"
        >
          <div className="px-5 py-3 border-b border-soft-moonstone/20 bg-dawn-light">
            <h2 className="text-xs uppercase tracking-wider text-deep-ocean font-medium">
              {bc.name}
            </h2>
          </div>
          <div className="p-5 grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor={`bundle-price-${bc.id}`}>Bundle Price</Label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-deep-ocean text-sm">£</span>
                <Input
                  id={`bundle-price-${bc.id}`}
                  type="text"
                  inputMode="decimal"
                  value={getBundleDisplayValue(bc, "priceInPence")}
                  onChange={(e) =>
                    setBundleEdits({
                      ...bundleEdits,
                      [bc.id]: {
                        ...bundleEdits[bc.id],
                        priceInPence: e.target.value,
                      },
                    })
                  }
                  className="h-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`bundle-credits-${bc.id}`}>
                Classes Included
              </Label>
              <Input
                id={`bundle-credits-${bc.id}`}
                type="number"
                min="1"
                value={getBundleDisplayValue(bc, "credits")}
                onChange={(e) =>
                  setBundleEdits({
                    ...bundleEdits,
                    [bc.id]: {
                      ...bundleEdits[bc.id],
                      credits: e.target.value,
                    },
                  })
                }
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label htmlFor={`bundle-expiry-${bc.id}`}>Expiry (days)</Label>
              <Input
                id={`bundle-expiry-${bc.id}`}
                type="number"
                min="1"
                value={getBundleDisplayValue(bc, "expiryDays")}
                onChange={(e) =>
                  setBundleEdits({
                    ...bundleEdits,
                    [bc.id]: {
                      ...bundleEdits[bc.id],
                      expiryDays: e.target.value,
                    },
                  })
                }
                className="mt-1 h-8"
              />
            </div>
          </div>
          <div className="px-5 pb-4 text-xs text-deep-ocean/60">
            Changes apply to new purchases only. Existing bundles keep their
            original terms.
          </div>
        </div>
      ))}

      {/* Error + Save */}
      <AdminAlert message={saveError} className="mb-4" />
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
