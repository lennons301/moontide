"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { PillGroup } from "@/components/admin/pill-group";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  buildAdminTableFilters,
  type TimeFilter,
} from "@/components/admin/table-filters";
import {
  PlainHeader,
  SortableHead,
  SortHeader,
} from "@/components/admin/table-headers";
import { useTableControls } from "@/components/admin/use-table-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WaitlistPanel } from "./waitlist-panel";

interface ClassType {
  id: number;
  slug: string;
  title: string;
  category: string;
  bookingType: string;
  active: boolean;
  priceInPence: number;
}

interface Schedule {
  schedules: {
    id: number;
    classId: number;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    bookedCount: number;
    location: string | null;
    recurringRule: string | null;
    status: string;
  };
  classes: ClassType;
  waitlistCount: number;
  /** Seats inside bookedCount that are being held for a waiting-list offer. */
  heldCount: number;
}

type StatusFilter = "all" | "open" | "full" | "cancelled";

export default function SchedulePage() {
  const [scheduleList, setScheduleList] = useState<Schedule[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSchedule, setWaitlistSchedule] = useState<Schedule | null>(
    null,
  );

  const [formData, setFormData] = useState({
    classId: "",
    date: "",
    startTime: "",
    endTime: "",
    capacity: "8",
    location: "",
    repeatWeekly: false,
    numberOfWeeks: "6",
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

  const fetchSchedules = useCallback(async () => {
    const res = await fetch("/api/admin/schedules");
    const data = await res.json();
    setScheduleList(data);
  }, []);

  const fetchClassTypes = useCallback(async () => {
    const res = await fetch("/api/admin/classes");
    const data = await res.json();
    setClassTypes(data);
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetchClassTypes();
  }, [fetchSchedules, fetchClassTypes]);

  const filters = useMemo(
    () =>
      buildAdminTableFilters<Schedule>(
        { status: statusFilter, classId: classFilter, time: timeFilter },
        {
          status: (row) => row.schedules.status,
          classId: (row) => row.classes.id,
          date: (row) => row.schedules.date,
        },
      ),
    [statusFilter, classFilter, timeFilter],
  );

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<Schedule>({
      rows: scheduleList,
      sortKeys: {
        class: (r) => r.classes.title,
        date: (r) => r.schedules.date,
        booked: (r) =>
          r.schedules.capacity === 0
            ? 0
            : r.schedules.bookedCount / r.schedules.capacity,
      },
      searchFields: (r) => [r.classes.title, r.schedules.location ?? ""],
      filters,
      defaultSort: { key: "date", direction: "asc" },
    });

  async function handleDelete(id: number) {
    if (!window.confirm("Are you sure you want to delete this schedule?")) {
      return;
    }
    const res = await fetch("/api/admin/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      await fetchSchedules();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    window.alert(data.error || "Failed to delete schedule.");
  }

  async function handleCancelClass(id: number) {
    if (
      !window.confirm(
        "Cancel this class? It will be hidden from the public calendar. Existing bookings remain — reschedule them individually from the Bookings page, or refund and notify customers separately.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled" }),
    });
    if (res.ok) {
      await fetchSchedules();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    window.alert(data.error || "Failed to cancel class.");
  }

  function handleEdit(item: Schedule) {
    setEditingId(item.schedules.id);
    setFormData({
      classId: String(item.schedules.classId),
      date: item.schedules.date,
      startTime: item.schedules.startTime,
      endTime: item.schedules.endTime,
      capacity: String(item.schedules.capacity),
      location: item.schedules.location || "",
      repeatWeekly: false,
      numberOfWeeks: "6",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const isEditing = editingId !== null;

    const res = await fetch("/api/admin/schedules", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isEditing
          ? {
              id: editingId,
              classId: Number(formData.classId),
              date: formData.date,
              startTime: formData.startTime,
              endTime: formData.endTime,
              capacity: Number(formData.capacity),
              location: formData.location || null,
              repeatWeekly: formData.repeatWeekly,
              numberOfWeeks: formData.repeatWeekly
                ? Number(formData.numberOfWeeks)
                : undefined,
            }
          : {
              classId: Number(formData.classId),
              date: formData.date,
              startTime: formData.startTime,
              endTime: formData.endTime,
              capacity: Number(formData.capacity),
              location: formData.location || null,
              repeatWeekly: formData.repeatWeekly,
              numberOfWeeks: formData.repeatWeekly
                ? Number(formData.numberOfWeeks)
                : undefined,
            },
      ),
    });

    if (res.ok) {
      setFormData({
        classId: "",
        date: "",
        startTime: "",
        endTime: "",
        capacity: "8",
        location: "",
        repeatWeekly: false,
        numberOfWeeks: "6",
      });
      setEditingId(null);
      setShowForm(false);
      await fetchSchedules();
    } else {
      // A refusal has a reason — lowering the capacity below the seats already
      // taken, say. Saying nothing leaves the form looking like it did nothing.
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(data.error || "Failed to save schedule.");
    }

    setSubmitting(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-deep-tide-blue">Schedule</h1>
        <Button
          onClick={() => {
            if (showForm) {
              setEditingId(null);
            }
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "New Class"}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-lg border border-soft-moonstone/30 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-deep-tide-blue">
            {editingId ? "Edit Schedule" : "Create Schedule"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="classId">Class Type</Label>
              <select
                id="classId"
                value={formData.classId}
                onChange={(e) =>
                  setFormData({ ...formData, classId: e.target.value })
                }
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                required
              >
                <option value="">Select a class</option>
                {classTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className="mt-1"
                required
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-4">
              <label
                htmlFor="repeatWeekly"
                className="flex items-center gap-2 text-sm font-medium text-deep-tide-blue cursor-pointer"
              >
                <input
                  id="repeatWeekly"
                  type="checkbox"
                  checked={formData.repeatWeekly}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      repeatWeekly: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-soft-moonstone accent-bright-orange"
                />
                Repeat weekly
              </label>
              {formData.repeatWeekly && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="numberOfWeeks" className="whitespace-nowrap">
                    Number of weeks
                  </Label>
                  <Input
                    id="numberOfWeeks"
                    type="number"
                    min="2"
                    max="52"
                    value={formData.numberOfWeeks}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        numberOfWeeks: e.target.value,
                      })
                    }
                    className="w-20"
                  />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) =>
                  setFormData({ ...formData, startTime: e.target.value })
                }
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData({ ...formData, endTime: e.target.value })
                }
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({ ...formData, capacity: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="location">Location (optional)</Label>
              <Input
                id="location"
                type="text"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                className="mt-1"
                placeholder="e.g. Studio 1, Hove"
              />
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
                  : "Create Schedule"}
            </Button>
          </div>
        </form>
      )}

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search class title or location..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "full", label: "Full" },
            { value: "cancelled", label: "Cancelled" },
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
          <SortableHead sort={sort} toggleSort={toggleSort}>
            <SortHeader label="Class" sortKey="class" />
            <SortHeader label="Date" sortKey="date" />
            <PlainHeader label="Time" />
            <PlainHeader label="Location" />
            <SortHeader label="Booked" sortKey="booked" />
            <PlainHeader label="Status" />
            <PlainHeader label="Actions" />
          </SortableHead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {scheduleList.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No scheduled classes yet.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No classes match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.schedules.id}
                  className="hover:bg-ocean-light-blue/10"
                >
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {item.classes.title}
                  </td>
                  <td className="px-4 py-3">{item.schedules.date}</td>
                  <td className="px-4 py-3">
                    {item.schedules.startTime} - {item.schedules.endTime}
                  </td>
                  <td className="px-4 py-3">
                    {item.schedules.location || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {/* Occupancy can no longer exceed capacity: a paid booking
                        on a full class raises the capacity with it, so there is
                        no over-capacity state left to badge here. */}
                    {item.schedules.bookedCount}/{item.schedules.capacity}
                    {item.heldCount > 0 && (
                      <span
                        className="ml-1 text-xs text-bright-orange"
                        title="Seats held for a waiting-list offer — nobody has taken them up yet"
                      >
                        ({item.heldCount} held)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={item.schedules.status} />
                      {item.waitlistCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistSchedule(item);
                            setWaitlistOpen(true);
                          }}
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-ocean-light-blue/20 text-ocean-light-blue hover:bg-ocean-light-blue/30 transition-colors cursor-pointer w-fit"
                        >
                          Waitlist ({item.waitlistCount})
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="text-ocean-light-blue hover:text-deep-tide-blue text-sm mr-3"
                    >
                      Edit
                    </button>
                    {item.schedules.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => handleCancelClass(item.schedules.id)}
                        className="text-bright-orange hover:text-deep-tide-blue text-sm mr-3"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(item.schedules.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {waitlistSchedule && (
        <WaitlistPanel
          open={waitlistOpen}
          onOpenChange={(o) => {
            setWaitlistOpen(o);
            if (!o) {
              fetchSchedules();
            }
          }}
          scheduleId={waitlistSchedule.schedules.id}
          classTitle={waitlistSchedule.classes.title}
          date={waitlistSchedule.schedules.date}
        />
      )}
    </div>
  );
}
