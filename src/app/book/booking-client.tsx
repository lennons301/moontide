"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ScheduleRow = {
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
    status: "open" | "full" | "cancelled";
  };
  classes: {
    id: number;
    slug: string;
    sanityId: string | null;
    category: "class" | "coaching" | "community";
    bookingType: "stripe" | "contact";
    active: boolean;
    priceInPence: number;
    title: string;
  };
};

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatPrice(pence: number) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function formatTime(time: string) {
  return time.slice(0, 5);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getCalendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  // getDay() returns 0 for Sunday — convert to Monday-based (0 = Mon, 6 = Sun)
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { day: number; month: number; year: number; key: string }[] = [];

  // Pad from previous month
  if (startDow > 0) {
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month - 1;
      const y = m < 0 ? year - 1 : year;
      const adjM = ((m % 12) + 12) % 12;
      cells.push({
        day: d,
        month: adjM,
        year: y,
        key: `${y}-${String(adjM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      month,
      year,
      key: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  // Pad to fill remaining cells (up to 42 = 6 rows x 7 cols)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month + 1;
    const y = m > 11 ? year + 1 : year;
    const adjM = m % 12;
    cells.push({
      day: d,
      month: adjM,
      year: y,
      key: `${y}-${String(adjM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  return cells;
}

function getMonthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function BookingClient({ schedules }: { schedules: ScheduleRow[] }) {
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [useBundle, setUseBundle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const initialMonth = useMemo(() => {
    if (schedules.length === 0) return new Date();
    const [y, m] = schedules[0].schedules.date.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [schedules]);

  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = useMemo(() => getTodayString(), []);

  // Group schedules by date
  const schedulesByDate = useMemo(() => {
    const map: Record<string, ScheduleRow[]> = {};
    for (const item of schedules) {
      const d = item.schedules.date;
      if (!map[d]) map[d] = [];
      map[d].push(item);
    }
    return map;
  }, [schedules]);

  const datesWithClasses = useMemo(
    () => new Set(Object.keys(schedulesByDate)),
    [schedulesByDate],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    setLoading(true);
    setError(null);

    if (useBundle) {
      try {
        const res = await fetch("/api/book/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId: selected.schedules.id,
            customerName: name,
            customerEmail: email,
          }),
        });

        if (res.ok) {
          window.location.href = "/book/confirmation?type=bundle-redeem";
          return;
        }

        // Bundle not found — fall back to Stripe checkout
      } catch {
        // Fall through to Stripe
      }
    }

    try {
      const res = await fetch("/api/book/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "individual",
          scheduleId: selected.schedules.id,
          customerName: name,
          customerEmail: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // Empty state
  if (schedules.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-deep-ocean leading-relaxed mb-6">
          No upcoming classes available right now. Please check back soon or get
          in touch.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
        >
          Contact Me
        </Link>
      </div>
    );
  }

  // Booking form view
  if (selected) {
    const spotsLeft =
      selected.schedules.capacity - selected.schedules.bookedCount;

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setError(null);
          }}
          className="text-ocean-light-blue hover:text-deep-tide-blue transition-colors mb-6 text-sm font-medium"
        >
          &larr; Back to classes
        </button>

        <div className="bg-soft-moonstone/40 rounded-lg p-6 mb-8">
          <h2 className="font-heading text-xl text-deep-tide-blue mb-1">
            {selected.classes.title}
          </h2>
          <p className="text-deep-ocean text-sm">
            {formatDate(selected.schedules.date)} &middot;{" "}
            {formatTime(selected.schedules.startTime)}&#8211;
            {formatTime(selected.schedules.endTime)}
          </p>
          {selected.schedules.location && (
            <p className="text-deep-ocean/70 text-sm mt-1">
              {selected.schedules.location}
            </p>
          )}
          <p className="text-deep-tide-blue font-semibold mt-2">
            {formatPrice(selected.classes.priceInPence)}
          </p>
          {spotsLeft < 3 && (
            <p className="text-red-600 text-sm mt-1 font-medium">
              Only {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="h-10"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="use-bundle"
              type="checkbox"
              checked={useBundle}
              onChange={(e) => setUseBundle(e.target.checked)}
              className="h-4 w-4 rounded border-soft-moonstone text-bright-orange focus:ring-bright-orange"
            />
            <Label htmlFor="use-bundle" className="cursor-pointer">
              I have a class bundle
            </Label>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-bright-orange text-dawn-light hover:bg-bright-orange/90 font-semibold text-base"
          >
            {loading ? "Processing..." : "Book This Class"}
          </Button>
        </form>
      </div>
    );
  }

  // Calendar view
  const calYear = currentMonth.getFullYear();
  const calMonth = currentMonth.getMonth();
  const cells = getCalendarGrid(calYear, calMonth);
  const classesForSelectedDate = selectedDate
    ? (schedulesByDate[selectedDate] ?? [])
    : [];

  function prevMonth() {
    setCurrentMonth(new Date(calYear, calMonth - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth(new Date(calYear, calMonth + 1, 1));
    setSelectedDate(null);
  }

  return (
    <div className="space-y-6">
      {/* Bundle Banner */}
      <div className="bg-bright-orange/10 border border-bright-orange/30 rounded-lg p-6 text-center">
        <h2 className="text-deep-tide-blue font-heading text-xl mb-1">
          Save with a 6-Class Bundle
        </h2>
        <p className="text-deep-ocean mb-4">
          6 classes for {formatPrice(7500)} &middot; Valid 90 days
        </p>
        <Link
          href="/book/bundle"
          className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
        >
          Purchase Bundle &rarr;
        </Link>
      </div>

      {/* Month Calendar Grid */}
      <div className="bg-white border border-soft-moonstone rounded-lg p-4 sm:p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 text-deep-ocean hover:text-deep-tide-blue transition-colors rounded hover:bg-soft-moonstone/30"
            aria-label="Previous month"
          >
            &larr;
          </button>
          <h3 className="font-heading text-lg text-deep-tide-blue">
            {getMonthLabel(calYear, calMonth)}
          </h3>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 text-deep-ocean hover:text-deep-tide-blue transition-colors rounded hover:bg-soft-moonstone/30"
            aria-label="Next month"
          >
            &rarr;
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center text-xs font-semibold text-deep-ocean py-2"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const isCurrentMonth =
              cell.month === calMonth && cell.year === calYear;
            const hasClasses = datesWithClasses.has(cell.key);
            const isSelected = selectedDate === cell.key;
            const isToday = cell.key === today;
            const isPast = cell.key < today;
            const isClickable = isCurrentMonth && hasClasses && !isPast;

            let cellClasses =
              "relative flex items-center justify-center h-10 sm:h-12 text-sm rounded transition-colors";

            if (!isCurrentMonth) {
              // Adjacent month padding
              cellClasses += " text-soft-moonstone/50";
            } else if (isSelected) {
              cellClasses +=
                " bg-bright-orange text-dawn-light font-semibold cursor-pointer";
            } else if (isPast || !hasClasses) {
              cellClasses += " text-soft-moonstone";
            } else {
              // Has classes, not selected, not past
              cellClasses +=
                " bg-bright-orange/15 text-deep-tide-blue font-semibold cursor-pointer hover:bg-bright-orange/25";
            }

            if (isToday) {
              cellClasses += " ring-2 ring-sky-mist";
            }

            return (
              <button
                key={cell.key}
                type="button"
                disabled={!isClickable}
                onClick={() => {
                  if (isClickable) setSelectedDate(cell.key);
                }}
                className={cellClasses}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Class list for selected date */}
      {selectedDate && classesForSelectedDate.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-lg text-deep-tide-blue">
            {formatDate(selectedDate)}
          </h3>
          {classesForSelectedDate.map((item) => {
            const spotsLeft =
              item.schedules.capacity - item.schedules.bookedCount;
            return (
              <button
                key={item.schedules.id}
                type="button"
                onClick={() => setSelected(item)}
                className="w-full text-left bg-white border border-soft-moonstone rounded-lg p-4 sm:p-5 hover:border-bright-orange/40 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-deep-tide-blue">
                      {item.classes.title}
                    </h4>
                    <p className="text-deep-ocean text-sm">
                      {formatTime(item.schedules.startTime)}&#8211;
                      {formatTime(item.schedules.endTime)}
                      {item.schedules.location &&
                        ` \u00b7 ${item.schedules.location}`}
                    </p>
                    <Link
                      href={`/classes/${item.classes.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-bright-orange text-sm hover:text-bright-orange/80 transition-colors"
                    >
                      View class details &rarr;
                    </Link>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                    <span className="font-semibold text-deep-tide-blue">
                      {formatPrice(item.classes.priceInPence)}
                    </span>
                    <span
                      className={`text-sm ${spotsLeft < 3 ? "text-red-600 font-medium" : "text-deep-ocean"}`}
                    >
                      {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
