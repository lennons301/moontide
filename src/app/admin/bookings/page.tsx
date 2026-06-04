"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";

interface BookingRow {
  bookings: {
    id: number;
    scheduleId: number;
    customerName: string;
    customerEmail: string;
    stripePaymentId: string | null;
    bundleId: number | null;
    status: string;
    createdAt: string;
    emailSent: boolean;
  };
  schedules: {
    id: number;
    classId: number;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    bookedCount: number;
    location: string | null;
    status: string;
  };
  classes: {
    id: number;
    slug: string;
    title: string;
    category: string;
    bookingType: string;
    active: boolean;
    priceInPence: number;
  };
}

interface ClassType {
  id: number;
  title: string;
}

type StatusFilter = "all" | "confirmed" | "cancelled" | "waitlisted";
type TimeFilter = "upcoming" | "past" | "all";

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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

export default function BookingsPage() {
  const [allBookings, setAllBookings] = useState<BookingRow[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

  const fetchBookings = useCallback(async () => {
    const res = await fetch("/api/admin/bookings");
    const data = await res.json();
    setAllBookings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBookings();
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => setClassTypes(d));
  }, [fetchBookings]);

  const filters = useMemo(() => {
    const today = todayString();
    const map: Record<string, (row: BookingRow) => boolean> = {};
    if (statusFilter !== "all") {
      map.status = (row) => row.bookings.status === statusFilter;
    }
    if (classFilter !== "all") {
      const id = Number(classFilter);
      map.class = (row) => row.classes.id === id;
    }
    if (timeFilter === "upcoming") {
      map.time = (row) => row.schedules.date >= today;
    } else if (timeFilter === "past") {
      map.time = (row) => row.schedules.date < today;
    }
    return map;
  }, [statusFilter, classFilter, timeFilter]);

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<BookingRow>({
      rows: allBookings,
      sortKeys: {
        customer: (r) => r.bookings.customerName,
        class: (r) => r.classes.title,
        date: (r) => r.schedules.date,
        status: (r) => r.bookings.status,
      },
      searchFields: (r) => [r.bookings.customerName, r.bookings.customerEmail],
      filters,
      defaultSort: { key: "date", direction: "asc" },
    });

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      confirmed: "bg-seagrass/20 text-seagrass",
      cancelled: "bg-red-100 text-red-700",
      waitlisted: "bg-ocean-light-blue/20 text-ocean-light-blue",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  }

  function paymentType(row: BookingRow) {
    return row.bookings.bundleId ? "Bundle" : "Stripe";
  }

  async function handleCancel(bookingId: number) {
    if (
      !window.confirm(
        "Cancel this booking? The class slot will be freed. You'll need to refund in Stripe separately.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/bookings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, status: "cancelled" }),
    });
    if (res.ok) {
      await fetchBookings();
    }
  }

  async function handleResendEmail(bookingId: number) {
    const res = await fetch("/api/admin/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "booking", id: bookingId }),
    });
    if (res.ok) {
      await fetchBookings();
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bookings
      </h1>

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or email..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "confirmed", label: "Confirmed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "waitlisted", label: "Waitlisted" },
          ]}
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-deep-ocean/60">Class:</span>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-7 rounded-full bg-soft-moonstone/30 px-2.5 text-xs text-deep-ocean focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="all">All</option>
            {classTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <PillGroup
          label="Time"
          value={timeFilter}
          onChange={setTimeFilter}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
            { value: "all", label: "All" },
          ]}
        />
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
                  label="Class"
                  sortKey="class"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("class")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Date"
                  sortKey="date"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("date")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Time
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Payment
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Status"
                  sortKey="status"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("status")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No bookings match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.bookings.id}
                  className="hover:bg-ocean-light-blue/10"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-deep-tide-blue">
                      {item.bookings.customerName}
                    </div>
                    <div className="text-xs text-deep-ocean/60">
                      {item.bookings.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {item.classes.title}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(item.schedules.date)}
                  </td>
                  <td className="px-4 py-3">
                    {item.schedules.startTime} - {item.schedules.endTime}
                  </td>
                  <td className="px-4 py-3">{paymentType(item)}</td>
                  <td className="px-4 py-3">
                    {statusBadge(item.bookings.status)}
                    {!item.bookings.emailSent && (
                      <button
                        type="button"
                        onClick={() => handleResendEmail(item.bookings.id)}
                        className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange hover:bg-bright-orange/30 transition-colors cursor-pointer"
                      >
                        resend email
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.bookings.status === "confirmed" && (
                      <button
                        type="button"
                        onClick={() => handleCancel(item.bookings.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Cancel
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
