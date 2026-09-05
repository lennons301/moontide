"use client";

import { useMemo, useState } from "react";
import { AdminAlert } from "@/components/admin/admin-alert";
import { mutateAdmin, useAdminResource } from "@/components/admin/admin-fetch";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { ClassFilterSelect } from "@/components/admin/class-filter-select";
import { formatDate, formatDateTime } from "@/components/admin/format-date";
import { PillGroup } from "@/components/admin/pill-group";
import { ResendEmailButton } from "@/components/admin/resend-email-button";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  buildAdminTableFilters,
  TIME_FILTER_OPTIONS,
  type TimeFilter,
} from "@/components/admin/table-filters";
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
import type {
  AdminBookingRow,
  AdminScheduleRow,
  ClassRow,
} from "@/lib/admin/rows";
import { describeReleaseEffect } from "@/lib/bookings/transitions";
import { RescheduleSheet } from "./reschedule-sheet";

type BookingRow = AdminBookingRow;

const NO_BOOKINGS: BookingRow[] = [];
const NO_SCHEDULES: AdminScheduleRow[] = [];
const NO_CLASSES: ClassRow[] = [];

type StatusFilter =
  | "all"
  | "confirmed"
  | "held"
  | "cancelled"
  | "waitlisted"
  | "released";

function formatPrice(priceInPence: number) {
  return `£${(priceInPence / 100).toFixed(2)}`;
}

function daysWaiting(releasedAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(releasedAt).getTime()) / 86_400_000,
  );
  if (days <= 0) return "today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export default function BookingsPage() {
  const {
    data: allBookings,
    loading,
    error: loadError,
    refetch: fetchBookings,
  } = useAdminResource<BookingRow[]>("/api/admin/bookings", NO_BOOKINGS);
  // The reschedule sheet's list of dates. Its own failure is carried into the
  // sheet: an empty list there would otherwise read as "no other dates for this
  // class" when the truth is that the load never arrived.
  const {
    data: allSchedules,
    error: schedulesError,
    refetch: fetchSchedules,
  } = useAdminResource<AdminScheduleRow[]>(
    "/api/admin/schedules",
    NO_SCHEDULES,
  );
  const { data: classTypes } = useAdminResource<ClassRow[]>(
    "/api/admin/classes",
    NO_CLASSES,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [reschedulingBooking, setReschedulingBooking] =
    useState<BookingRow | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

  const filters = useMemo(
    () =>
      buildAdminTableFilters<BookingRow>(
        { status: statusFilter, classId: classFilter, time: timeFilter },
        {
          status: (row) => row.bookings.status,
          classId: (row) => row.classes.id,
          date: (row) => row.schedules.date,
        },
      ),
    [statusFilter, classFilter, timeFilter],
  );

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<BookingRow>({
      rows: allBookings,
      sortKeys: {
        customer: (r) => r.bookings.customerName,
        class: (r) => r.bookings.classTitle,
        date: (r) => r.schedules.date,
        status: (r) => r.bookings.status,
      },
      searchFields: (r) => [r.bookings.customerName, r.bookings.customerEmail],
      filters,
      defaultSort: { key: "date", direction: "asc" },
    });

  const tableState = {
    loading,
    error: loadError,
    isEmpty: rows.length === 0,
    emptyMessage:
      allBookings.length === 0
        ? "No bookings yet."
        : "No bookings match the current filters.",
  };

  // Released bookings are card payers who are owed a class: the seat is back,
  // the money is not. Longest wait first.
  const owedRows = useMemo(
    () =>
      allBookings
        .filter((r) => r.bookings.status === "released")
        .sort((a, b) =>
          (a.bookings.releasedAt ?? "") < (b.bookings.releasedAt ?? "")
            ? -1
            : 1,
        ),
    [allBookings],
  );

  function paymentType(row: BookingRow) {
    // A held seat occupies capacity but nobody has paid for it — calling that
    // "Stripe" would read as a booking that is coming.
    if (row.bookings.status === "held") return "Held — unpaid";
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
    setActionError(null);
    // "Booking is already cancelled" is a sentence the API went to the trouble
    // of writing; dropping it left the row not moving and no reason given.
    const result = await mutateAdmin("/api/admin/bookings", {
      method: "PUT",
      body: { id: bookingId, status: "cancelled" },
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await fetchBookings();
    await fetchSchedules();
  }

  async function handleRelease(row: BookingRow) {
    const { summary, detail } = describeReleaseEffect(row.bookings);
    if (
      !window.confirm(
        `Release ${row.bookings.customerName}'s seat on ${formatDate(row.schedules.date)}?\n\n${summary}\n\n${detail}`,
      )
    ) {
      return;
    }
    setActionError(null);
    const result = await mutateAdmin("/api/admin/bookings", {
      method: "PUT",
      body: { id: row.bookings.id, status: "released" },
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await fetchBookings();
    await fetchSchedules();
  }

  async function handleResendEmail(bookingId: number) {
    setActionError(null);
    const result = await mutateAdmin("/api/admin/resend-email", {
      method: "POST",
      body: { type: "booking", id: bookingId },
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    await fetchBookings();
  }

  function openReschedule(row: BookingRow) {
    setReschedulingBooking(row);
    setRescheduleOpen(true);
  }

  async function handleRescheduleMoved() {
    await fetchBookings();
    await fetchSchedules();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bookings
      </h1>

      <AdminAlert message={actionError} className="mb-4" />

      {owedRows.length > 0 && (
        <section className="mb-6 rounded-lg border border-bright-orange/30 bg-bright-orange/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-bright-orange">
            Owed a class ({owedRows.length})
          </h2>
          <p className="mt-1 mb-3 text-xs text-deep-ocean/70">
            Card payers whose seat you released. Nothing was refunded — they
            stay here until you move them onto a new date. They cannot re-book
            the class they were released from themselves, so the move is yours
            to make.
          </p>
          <ul className="divide-y divide-bright-orange/20">
            {owedRows.map((item) => (
              <li
                key={item.bookings.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-deep-tide-blue">
                    {item.bookings.customerName}{" "}
                    <span className="font-normal text-deep-ocean/60">
                      · {item.bookings.classTitle}
                    </span>
                  </p>
                  <p className="text-xs text-deep-ocean/60">
                    {item.bookings.customerEmail} · released from{" "}
                    {formatDate(item.schedules.date)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className="text-sm text-deep-ocean"
                    title="Current price for this class"
                  >
                    Paid {formatPrice(item.classes.priceInPence)}
                  </span>
                  <span className="text-sm text-deep-ocean">
                    Waiting{" "}
                    {item.bookings.releasedAt
                      ? daysWaiting(item.bookings.releasedAt)
                      : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => openReschedule(item)}
                    className="text-sm text-ocean-light-blue hover:text-deep-tide-blue"
                  >
                    Reschedule
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            { value: "held", label: "Held" },
            { value: "released", label: "Released" },
            { value: "cancelled", label: "Cancelled" },
            { value: "waitlisted", label: "Waitlisted" },
          ]}
        />
        <ClassFilterSelect
          value={classFilter}
          onChange={setClassFilter}
          classes={classTypes}
        />
        <PillGroup
          label="Time"
          value={timeFilter}
          onChange={setTimeFilter}
          options={TIME_FILTER_OPTIONS}
        />
      </AdminTableToolbar>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <SortableHead sort={sort} toggleSort={toggleSort}>
            <SortHeader label="Customer" sortKey="customer" />
            <SortHeader label="Class" sortKey="class" />
            <SortHeader label="Date" sortKey="date" />
            <PlainHeader label="Time" />
            <PlainHeader label="Payment" />
            <SortHeader label="Status" sortKey="status" />
            <PlainHeader label="Actions" />
          </SortableHead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {adminStateMessage(tableState) !== null ? (
              <TableStateRow colSpan={7} {...tableState} />
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
                    {item.bookings.classTitle}
                  </td>
                  <td className="px-4 py-3">
                    <span>{formatDate(item.schedules.date)}</span>
                    {item.bookings.rescheduledAt && (
                      <span
                        title={`Moved on ${formatDateTime(item.bookings.rescheduledAt)}`}
                        className="ml-2 inline-block rounded-full bg-soft-moonstone/30 px-2 py-0.5 text-xs text-deep-ocean"
                      >
                        moved
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.schedules.startTime} - {item.schedules.endTime}
                  </td>
                  <td className="px-4 py-3">{paymentType(item)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.bookings.status} />
                    {/* A held seat is an offer nobody has taken up, so there is
                        no confirmation to send or resend for it. Every other
                        booking gets the button whatever its flag says. */}
                    {item.bookings.status !== "held" && (
                      <ResendEmailButton
                        delivery={item.bookings}
                        onResend={() => handleResendEmail(item.bookings.id)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(item.bookings.status === "confirmed" ||
                      item.bookings.status === "released") && (
                      <>
                        <button
                          type="button"
                          onClick={() => openReschedule(item)}
                          className="text-ocean-light-blue hover:text-deep-tide-blue text-sm mr-3"
                        >
                          Reschedule
                        </button>
                        {item.bookings.status === "confirmed" && (
                          <button
                            type="button"
                            onClick={() => handleRelease(item)}
                            className="text-bright-orange hover:text-deep-tide-blue text-sm mr-3"
                          >
                            Release
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCancel(item.bookings.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reschedulingBooking && (
        <RescheduleSheet
          open={rescheduleOpen}
          onOpenChange={(o) => {
            setRescheduleOpen(o);
            if (!o) setReschedulingBooking(null);
          }}
          bookingId={reschedulingBooking.bookings.id}
          customerName={reschedulingBooking.bookings.customerName}
          classTitle={reschedulingBooking.bookings.classTitle}
          sourceScheduleId={reschedulingBooking.schedules.id}
          sourceClassId={reschedulingBooking.classes.id}
          sourceDate={reschedulingBooking.schedules.date}
          sourceStartTime={reschedulingBooking.schedules.startTime}
          sourceEndTime={reschedulingBooking.schedules.endTime}
          allSchedules={allSchedules.map((s) => s.schedules)}
          schedulesError={schedulesError}
          onMoved={handleRescheduleMoved}
        />
      )}
    </div>
  );
}
