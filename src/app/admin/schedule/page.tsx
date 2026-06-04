"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
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
}

type StatusFilter = "all" | "open" | "full" | "cancelled";
type TimeFilter = "upcoming" | "past" | "all";

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

  const filters = useMemo(() => {
    const today = todayString();
    const map: Record<string, (row: Schedule) => boolean> = {};
    if (statusFilter !== "all") {
      map.status = (row) => row.schedules.status === statusFilter;
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
        "Cancel this class? It will be hidden from the public calendar. Existing bookings remain — refund and notify customers separately.",
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
    }

    setSubmitting(false);
  }

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      open: "bg-seagrass/20 text-seagrass",
      full: "bg-bright-orange/20 text-bright-orange",
      cancelled: "bg-red-100 text-red-700",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
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
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light">
            <tr>
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
                Location
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Booked"
                  sortKey="booked"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("booked")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Status
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Actions
              </th>
            </tr>
          </thead>
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
                    {item.schedules.bookedCount}/{item.schedules.capacity}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {statusBadge(item.schedules.status)}
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
