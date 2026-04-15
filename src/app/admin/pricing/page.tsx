"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ClassPrice {
  id: number;
  title: string;
  slug: string;
  priceInPence: number;
}

interface BundleConfigRow {
  id: number;
  name: string;
  priceInPence: number;
  credits: number;
  expiryDays: number;
  active: boolean;
}

function penceToPounds(pence: number) {
  return (pence / 100).toFixed(2);
}

function poundsToPence(pounds: string) {
  const parsed = Number.parseFloat(pounds);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export default function PricingPage() {
  const [classes, setClasses] = useState<ClassPrice[]>([]);
  const [bundleConfigs, setBundleConfigs] = useState<BundleConfigRow[]>([]);
  const [classEdits, setClassEdits] = useState<Record<number, string>>({});
  const [bundleEdits, setBundleEdits] = useState<
    Record<
      number,
      { priceInPence?: string; credits?: string; expiryDays?: string }
    >
  >({});
  const [saving, setSaving] = useState(false);

  const fetchPricing = useCallback(async () => {
    const res = await fetch("/api/admin/pricing");
    const data = await res.json();
    setClasses(data.classes);
    setBundleConfigs(data.bundleConfigs);
    setClassEdits({});
    setBundleEdits({});
  }, []);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  function getClassDisplayPrice(c: ClassPrice) {
    return classEdits[c.id] ?? penceToPounds(c.priceInPence);
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

  function buildChangeSummary(): string[] {
    const changes: string[] = [];

    for (const c of classes) {
      if (classEdits[c.id] !== undefined) {
        const newPence = poundsToPence(classEdits[c.id]);
        if (newPence !== c.priceInPence) {
          changes.push(
            `${c.title}: £${penceToPounds(c.priceInPence)} → £${penceToPounds(newPence)}`,
          );
        }
      }
    }

    for (const bc of bundleConfigs) {
      const edits = bundleEdits[bc.id];
      if (!edits) continue;

      if (edits.priceInPence !== undefined) {
        const newPence = poundsToPence(edits.priceInPence);
        if (newPence !== bc.priceInPence) {
          changes.push(
            `${bc.name} price: £${penceToPounds(bc.priceInPence)} → £${penceToPounds(newPence)}`,
          );
        }
      }
      if (edits.credits !== undefined) {
        const newCredits = Number.parseInt(edits.credits, 10);
        if (newCredits !== bc.credits) {
          changes.push(`${bc.name} credits: ${bc.credits} → ${newCredits}`);
        }
      }
      if (edits.expiryDays !== undefined) {
        const newDays = Number.parseInt(edits.expiryDays, 10);
        if (newDays !== bc.expiryDays) {
          changes.push(
            `${bc.name} expiry: ${bc.expiryDays} days → ${newDays} days`,
          );
        }
      }
    }

    return changes;
  }

  async function handleSave() {
    const changes = buildChangeSummary();
    if (changes.length === 0) return;

    const confirmed = window.confirm(
      `Update pricing?\n\n${changes.join("\n")}\n\nChanges apply to new purchases only.`,
    );
    if (!confirmed) return;

    setSaving(true);

    const classUpdatePayload = classes
      .filter((c) => classEdits[c.id] !== undefined)
      .map((c) => ({ id: c.id, priceInPence: poundsToPence(classEdits[c.id]) }))
      .filter((c) => {
        const original = classes.find((cl) => cl.id === c.id);
        return original && c.priceInPence !== original.priceInPence;
      });

    const bundleUpdatePayload = bundleConfigs
      .filter((bc) => bundleEdits[bc.id])
      .map((bc) => {
        const edits = bundleEdits[bc.id];
        const update: {
          id: number;
          priceInPence?: number;
          credits?: number;
          expiryDays?: number;
        } = { id: bc.id };

        if (edits.priceInPence !== undefined) {
          const newPence = poundsToPence(edits.priceInPence);
          if (newPence !== bc.priceInPence) update.priceInPence = newPence;
        }
        if (edits.credits !== undefined) {
          const newCredits = Number.parseInt(edits.credits, 10);
          if (newCredits !== bc.credits) update.credits = newCredits;
        }
        if (edits.expiryDays !== undefined) {
          const newDays = Number.parseInt(edits.expiryDays, 10);
          if (newDays !== bc.expiryDays) update.expiryDays = newDays;
        }

        return update;
      })
      .filter(
        (u) =>
          u.priceInPence !== undefined ||
          u.credits !== undefined ||
          u.expiryDays !== undefined,
      );

    const payload: Record<string, unknown> = {};
    if (classUpdatePayload.length > 0) payload.classes = classUpdatePayload;
    if (bundleUpdatePayload.length > 0)
      payload.bundleConfigs = bundleUpdatePayload;

    const res = await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchPricing();
    }

    setSaving(false);
  }

  const hasChanges = buildChangeSummary().length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-deep-tide-blue">Pricing</h1>
      </div>

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

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
