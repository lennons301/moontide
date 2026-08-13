"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface OfferClientProps {
  scheduleId: number;
  token: string;
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  time: string;
  location: string | null;
  deadline: string;
  creditsAvailable: number;
  bundleEligible: boolean;
}

export function OfferClient({
  scheduleId,
  token,
  customerName,
  customerEmail,
  classTitle,
  date,
  time,
  location,
  deadline,
  creditsAvailable,
  bundleEligible,
}: OfferClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseCredit = bundleEligible && creditsAvailable > 0;

  async function handleAccept() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId,
          customerName,
          customerEmail,
          offerToken: token,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = "/book/confirmation";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue text-center mb-3">
        A place has come up
      </h1>
      <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />

      <p className="text-deep-ocean mb-6">
        Hi {customerName}, this place is being held for you.
      </p>

      <div className="bg-soft-moonstone/40 rounded-lg p-6 mb-6">
        <h2 className="font-heading text-xl text-deep-tide-blue mb-1">
          {classTitle}
        </h2>
        <p className="text-deep-ocean text-sm">
          {date} &middot; {time}
        </p>
        {location && (
          <p className="text-deep-ocean/70 text-sm mt-1">{location}</p>
        )}
        <p className="text-bright-orange font-medium mt-3">
          Held for you until {deadline}
        </p>
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-4" role="alert">
          {error}
        </p>
      )}

      {canUseCredit ? (
        <>
          <p className="text-deep-ocean mb-4">
            You have {creditsAvailable}{" "}
            {creditsAvailable === 1 ? "class credit" : "class credits"} on{" "}
            {customerEmail}. Taking this place uses one of them.
          </p>
          <Button
            type="button"
            onClick={handleAccept}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Booking..." : "Use a credit and take this place"}
          </Button>
        </>
      ) : (
        <div className="rounded-lg border border-soft-moonstone/40 p-4">
          <p className="text-deep-ocean">
            {bundleEligible
              ? `We couldn't find any class credits on ${customerEmail}.`
              : "This class can't be booked with class credits."}{" "}
            Get in touch with Gabrielle and she'll take it from there — the
            place is still yours until the time above.
          </p>
          <Link
            href="/contact"
            className="mt-4 inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
          >
            Contact Gabrielle
          </Link>
        </div>
      )}
    </div>
  );
}
