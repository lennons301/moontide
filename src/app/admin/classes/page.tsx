"use client";

import { useMemo, useState } from "react";
import { AdminAlert } from "@/components/admin/admin-alert";
import { mutateAdmin, useAdminResource } from "@/components/admin/admin-fetch";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { PillGroup } from "@/components/admin/pill-group";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  PlainHeader,
  SortableHead,
  SortHeader,
} from "@/components/admin/table-headers";
import {
  adminStateMessage,
  TableStateRow,
} from "@/components/admin/table-state";
import { useTableControls } from "@/components/admin/use-table-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { penceToPounds, poundsToPence } from "@/lib/admin/pricing-changes";
import type { ClassRow } from "@/lib/admin/rows";
import {
  BOOKING_TYPES,
  CLASS_CATEGORIES,
  type ClassCategory,
} from "@/lib/classes/categories";

const NO_CLASSES: ClassRow[] = [];

type ActiveFilter = "all" | "active" | "inactive";
type CategoryFilter = "all" | ClassCategory;

function formatCategory(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default function ClassesPage() {
  const {
    data: classList,
    loading,
    error: loadError,
    refetch: fetchClasses,
  } = useAdminResource<ClassRow[]>("/api/admin/classes?all=true", NO_CLASSES);

  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    category: "class" as ClassCategory,
    bookingType: "stripe" as (typeof BOOKING_TYPES)[number],
    priceInPence: "0.00",
    active: true,
    bundleEligible: true,
  });

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const filters = useMemo(() => {
    const map: Record<string, (row: ClassRow) => boolean> = {};
    if (activeFilter !== "all") {
      const wanted = activeFilter === "active";
      map.active = (row) => row.active === wanted;
    }
    if (categoryFilter !== "all") {
      map.category = (row) => row.category === categoryFilter;
    }
    return map;
  }, [activeFilter, categoryFilter]);

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<ClassRow>({
      rows: classList,
      sortKeys: {
        title: (r) => r.title,
        category: (r) => r.category,
        price: (r) => r.priceInPence,
      },
      searchFields: (r) => [r.title, r.slug],
      filters,
      defaultSort: { key: "title", direction: "asc" },
    });

  const tableState = {
    loading,
    error: loadError,
    isEmpty: rows.length === 0,
    emptyMessage:
      classList.length === 0
        ? "No classes yet."
        : "No classes match the current filters.",
  };

  function resetForm() {
    setFormData({
      title: "",
      slug: "",
      category: "class",
      bookingType: "stripe",
      priceInPence: "0.00",
      active: true,
      bundleEligible: true,
    });
    setEditingId(null);
  }

  function handleEdit(item: ClassRow) {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      slug: item.slug,
      category: item.category,
      bookingType: item.bookingType,
      priceInPence: penceToPounds(item.priceInPence),
      active: item.active,
      bundleEligible: item.bundleEligible,
    });
    setShowForm(true);
  }

  async function handleToggleActive(item: ClassRow) {
    setActionError(null);
    const result = await mutateAdmin("/api/admin/classes", {
      method: "PUT",
      body: { id: item.id, active: !item.active },
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await fetchClasses();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);

    const isEditing = editingId !== null;

    const fields = {
      title: formData.title,
      category: formData.category,
      bookingType: formData.bookingType,
      priceInPence: poundsToPence(formData.priceInPence),
      active: formData.active,
      bundleEligible: formData.bundleEligible,
    };

    const result = await mutateAdmin("/api/admin/classes", {
      method: isEditing ? "PUT" : "POST",
      // Slug is only ever sent on create — the API does not accept it on an
      // update, because changing one after launch needs a redirect this
      // surface does not build yet.
      body: isEditing
        ? { id: editingId, ...fields }
        : { slug: formData.slug, ...fields },
    });

    if (result.ok) {
      resetForm();
      setShowForm(false);
      await fetchClasses();
    } else {
      setActionError(result.error);
    }

    setSubmitting(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-deep-tide-blue">Classes</h1>
        <Button
          onClick={() => {
            if (showForm) {
              resetForm();
            }
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "New Class"}
        </Button>
      </div>

      <AdminAlert message={actionError} className="mb-4" />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-lg border border-soft-moonstone/30 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-deep-tide-blue">
            {editingId ? "Edit Class" : "Create Class"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="slug">Slug</Label>
              {editingId ? (
                <p className="mt-1 flex h-8 items-center text-sm text-deep-ocean/60">
                  {formData.slug} (fixed at creation)
                </p>
              ) : (
                <Input
                  id="slug"
                  type="text"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  placeholder="e.g. prenatal-yoga"
                  className="mt-1"
                  required
                />
              )}
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    category: e.target.value as ClassCategory,
                  })
                }
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {CLASS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {formatCategory(category)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="bookingType">Booking Type</Label>
              <select
                id="bookingType"
                value={formData.bookingType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bookingType: e.target
                      .value as (typeof BOOKING_TYPES)[number],
                  })
                }
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {BOOKING_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {formatCategory(type)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="priceInPence">Price</Label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-deep-ocean text-sm">£</span>
                <Input
                  id="priceInPence"
                  type="text"
                  inputMode="decimal"
                  value={formData.priceInPence}
                  onChange={(e) =>
                    setFormData({ ...formData, priceInPence: e.target.value })
                  }
                  className="h-8"
                />
              </div>
            </div>
            <div className="flex items-end gap-4">
              <label
                htmlFor="active"
                className="flex items-center gap-2 text-sm font-medium text-deep-tide-blue cursor-pointer"
              >
                <input
                  id="active"
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) =>
                    setFormData({ ...formData, active: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-soft-moonstone accent-bright-orange"
                />
                Active
              </label>
              <label
                htmlFor="bundleEligible"
                className="flex items-center gap-2 text-sm font-medium text-deep-tide-blue cursor-pointer"
              >
                <input
                  id="bundleEligible"
                  type="checkbox"
                  checked={formData.bundleEligible}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bundleEligible: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-soft-moonstone accent-bright-orange"
                />
                Bookable with a bundle
              </label>
            </div>
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? editingId
                  ? "Saving..."
                  : "Creating..."
                : editingId
                  ? "Save Changes"
                  : "Create Class"}
            </Button>
          </div>
        </form>
      )}

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title or slug..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={activeFilter}
          onChange={setActiveFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <PillGroup
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: "all", label: "All" },
            ...CLASS_CATEGORIES.map((category) => ({
              value: category,
              label: formatCategory(category),
            })),
          ]}
        />
      </AdminTableToolbar>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <SortableHead sort={sort} toggleSort={toggleSort}>
            <SortHeader label="Title" sortKey="title" />
            <PlainHeader label="Slug" />
            <SortHeader label="Category" sortKey="category" />
            <PlainHeader label="Booking Type" />
            <SortHeader label="Price" sortKey="price" />
            <PlainHeader label="Bundle Eligible" />
            <PlainHeader label="Status" />
            <PlainHeader label="Actions" />
          </SortableHead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {adminStateMessage(tableState) !== null ? (
              <TableStateRow colSpan={8} {...tableState} />
            ) : (
              rows.map((item) => (
                <tr key={item.id} className="hover:bg-ocean-light-blue/10">
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {item.title}
                  </td>
                  <td className="px-4 py-3 text-deep-ocean/70">{item.slug}</td>
                  <td className="px-4 py-3">{formatCategory(item.category)}</td>
                  <td className="px-4 py-3">
                    {formatCategory(item.bookingType)}
                  </td>
                  <td className="px-4 py-3">
                    £{penceToPounds(item.priceInPence)}
                  </td>
                  <td className="px-4 py-3">
                    {item.bundleEligible ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="text-ocean-light-blue hover:text-deep-tide-blue text-sm mr-3"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className="text-bright-orange hover:text-deep-tide-blue text-sm"
                    >
                      {item.active ? "Deactivate" : "Reactivate"}
                    </button>
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
