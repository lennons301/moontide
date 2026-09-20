"use client";

import { useState } from "react";
import { AdminAlert } from "@/components/admin/admin-alert";
import { mutateAdmin, useAdminResource } from "@/components/admin/admin-fetch";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildChangeSummary,
  buildPricingPayload,
  penceToPounds,
  poundsToPence,
} from "@/lib/admin/pricing-changes";
import type { AdminPricingResponse } from "@/lib/admin/rows";

type BundleConfigRow = AdminPricingResponse["bundleConfigs"][number];

const NO_PRICING: AdminPricingResponse = { bundleConfigs: [] };

const EMPTY_NEW_BUNDLE = {
  name: "",
  priceInPence: "0.00",
  credits: "6",
  expiryDays: "90",
};

export default function PricingPage() {
  const {
    data: pricing,
    loading,
    error: loadError,
    refetch,
  } = useAdminResource<AdminPricingResponse>("/api/admin/pricing", NO_PRICING);
  const { bundleConfigs } = pricing;
  const [bundleEdits, setBundleEdits] = useState<
    Record<
      number,
      { priceInPence?: string; credits?: string; expiryDays?: string }
    >
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBundle, setNewBundle] = useState(EMPTY_NEW_BUNDLE);

  async function reloadPricing() {
    setBundleEdits({});
    await refetch();
  }

  async function handleToggleActive(bc: BundleConfigRow) {
    setActionError(null);
    const result = await mutateAdmin("/api/admin/pricing", {
      method: "PUT",
      body: { bundleConfigs: [{ id: bc.id, active: !bc.active }] },
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await reloadPricing();
  }

  async function handleDelete(bc: BundleConfigRow) {
    if (!window.confirm(`Delete "${bc.name}"? This can't be undone.`)) {
      return;
    }
    setActionError(null);
    const result = await mutateAdmin("/api/admin/pricing", {
      method: "DELETE",
      body: { id: bc.id },
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await reloadPricing();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setActionError(null);

    const result = await mutateAdmin("/api/admin/pricing", {
      method: "POST",
      body: {
        name: newBundle.name,
        priceInPence: poundsToPence(newBundle.priceInPence),
        credits: Number.parseInt(newBundle.credits, 10),
        expiryDays: Number.parseInt(newBundle.expiryDays, 10),
      },
    });

    if (result.ok) {
      setNewBundle(EMPTY_NEW_BUNDLE);
      setShowForm(false);
      await reloadPricing();
    } else {
      setActionError(result.error);
    }

    setCreating(false);
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

  const rows = { bundleConfigs };
  const edits = { bundles: bundleEdits };

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-deep-tide-blue">Pricing</h1>
        <Button
          onClick={() => {
            if (showForm) setNewBundle(EMPTY_NEW_BUNDLE);
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "New Bundle"}
        </Button>
      </div>

      <AdminAlert message={loadError} className="mb-4" />
      <AdminAlert message={actionError} className="mb-4" />
      {loading && (
        <p className="mb-4 text-sm text-soft-moonstone">Loading...</p>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-soft-moonstone/30 bg-white p-5 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-deep-tide-blue">
            Create Bundle
          </h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="new-bundle-name">Name</Label>
              <Input
                id="new-bundle-name"
                type="text"
                value={newBundle.name}
                onChange={(e) =>
                  setNewBundle({ ...newBundle, name: e.target.value })
                }
                placeholder="e.g. 4-Class Bundle"
                className="mt-1 h-8"
                required
              />
            </div>
            <div>
              <Label htmlFor="new-bundle-price">Bundle Price</Label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-deep-ocean text-sm">£</span>
                <Input
                  id="new-bundle-price"
                  type="text"
                  inputMode="decimal"
                  value={newBundle.priceInPence}
                  onChange={(e) =>
                    setNewBundle({
                      ...newBundle,
                      priceInPence: e.target.value,
                    })
                  }
                  className="h-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-bundle-credits">Classes Included</Label>
              <Input
                id="new-bundle-credits"
                type="number"
                min="1"
                value={newBundle.credits}
                onChange={(e) =>
                  setNewBundle({ ...newBundle, credits: e.target.value })
                }
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label htmlFor="new-bundle-expiry">Expiry (days)</Label>
              <Input
                id="new-bundle-expiry"
                type="number"
                min="1"
                value={newBundle.expiryDays}
                onChange={(e) =>
                  setNewBundle({ ...newBundle, expiryDays: e.target.value })
                }
                className="mt-1 h-8"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Bundle"}
            </Button>
          </div>
        </form>
      )}

      {/* Bundle Configuration */}
      {bundleConfigs.map((bc) => (
        <div
          key={bc.id}
          className="rounded-lg border border-soft-moonstone/30 bg-white shadow-sm mb-6"
        >
          <div className="px-5 py-3 border-b border-soft-moonstone/20 bg-dawn-light flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xs uppercase tracking-wider text-deep-ocean font-medium">
                {bc.name}
              </h2>
              <StatusBadge status={bc.active ? "active" : "inactive"} />
            </div>
            <div>
              <button
                type="button"
                onClick={() => handleToggleActive(bc)}
                className="text-ocean-light-blue hover:text-deep-tide-blue text-sm mr-3"
              >
                {bc.active ? "Deactivate" : "Activate"}
              </button>
              {!bc.purchased && (
                <button
                  type="button"
                  onClick={() => handleDelete(bc)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              )}
            </div>
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
