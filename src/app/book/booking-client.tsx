"use client";

import Link from "next/link";
import { useState } from "react";
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

export function BookingClient({ schedules }: { schedules: ScheduleRow[] }) {
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [useBundle, setUseBundle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (schedules.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-deep-ocean leading-relaxed mb-6">
          No upcoming classes available right now. Please check back soon or get
          in touch.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-lunar-gold text-foam-white px-6 py-3 rounded-md font-semibold hover:bg-lunar-gold/90 transition-colors"
        >
          Contact Me
        </Link>
      </div>
    );
  }

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
          className="text-shallow-water hover:text-deep-current transition-colors mb-6 text-sm font-medium"
        >
          &larr; Back to classes
        </button>

        <div className="bg-driftwood/40 rounded-lg p-6 mb-8">
          <h2 className="font-heading text-xl text-deep-current mb-1">
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
          <p className="text-deep-current font-semibold mt-2">
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
              className="h-4 w-4 rounded border-driftwood text-lunar-gold focus:ring-lunar-gold"
            />
            <Label htmlFor="use-bundle" className="cursor-pointer">
              I have a class bundle
            </Label>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-lunar-gold text-foam-white hover:bg-lunar-gold/90 font-semibold text-base"
          >
            {loading ? "Processing..." : "Book This Class"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {schedules.map((item) => {
        const spotsLeft = item.schedules.capacity - item.schedules.bookedCount;

        return (
          <button
            key={item.schedules.id}
            type="button"
            onClick={() => setSelected(item)}
            className="w-full text-left bg-driftwood/30 hover:bg-driftwood/50 rounded-lg p-5 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg text-deep-current">
                  {item.classes.title}
                </h2>
                <p className="text-deep-ocean text-sm">
                  {formatDate(item.schedules.date)} &middot;{" "}
                  {formatTime(item.schedules.startTime)}&#8211;
                  {formatTime(item.schedules.endTime)}
                </p>
                {item.schedules.location && (
                  <p className="text-deep-ocean/70 text-sm">
                    {item.schedules.location}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 sm:text-right">
                <span className="font-semibold text-deep-current">
                  {formatPrice(item.classes.priceInPence)}
                </span>
                {spotsLeft < 3 ? (
                  <span className="text-red-600 text-sm font-medium">
                    {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                  </span>
                ) : (
                  <span className="text-deep-ocean/60 text-sm">
                    {spotsLeft} spots
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}

      <div className="text-center pt-6 border-t border-driftwood/50 mt-8">
        <p className="text-deep-ocean text-sm mb-3">
          Save with a bundle — 6 classes for just {formatPrice(7500)}
        </p>
        <Link
          href="/book/bundle"
          className="text-lunar-gold hover:text-lunar-gold/80 font-medium text-sm transition-colors"
        >
          Purchase a bundle &rarr;
        </Link>
      </div>
    </div>
  );
}
