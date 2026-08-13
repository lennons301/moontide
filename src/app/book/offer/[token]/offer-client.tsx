"use client";

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
  priceInPence: number;
}

function formatPrice(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
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
  priceInPence,
}: OfferClientProps) {
  const [loading, setLoading] = useState<"credit" | "card" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUseCredit = bundleEligible && creditsAvailable > 0;

  async function post(url: string) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId,
        customerName,
        customerEmail,
        offerToken: token,
      }),
    });
  }

  async function readError(res: Response) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error || "Something went wrong. Please try again.");
    setLoading(null);
  }

  async function handleAccept() {
    setLoading("credit");
    setError(null);
    try {
      const res = await post("/api/book/redeem");
      if (!res.ok) return readError(res);

      window.location.href = "/book/confirmation";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  /**
   * Pay for the held seat by card. The token goes with the request: it is what
   * lets checkout past the checks the recipient's own held seat would otherwise
   * trip, and what tells the payment to convert that seat rather than book a
   * second one.
   */
  async function handlePayByCard() {
    setLoading("card");
    setError(null);
    try {
      const res = await post("/api/book/checkout");
      if (!res.ok) return readError(res);

      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError("Something went wrong. Please try again.");
        setLoading(null);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(null);
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
            {customerEmail}. Taking this place uses one of them, or you can pay
            for it and keep them.
          </p>
          <Button
            type="button"
            onClick={handleAccept}
            disabled={loading !== null}
            className="w-full"
          >
            {loading === "credit"
              ? "Booking..."
              : "Use a credit and take this place"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePayByCard}
            disabled={loading !== null}
            className="w-full mt-3"
          >
            {loading === "card"
              ? "Taking you to payment..."
              : `Pay ${formatPrice(priceInPence)} by card instead`}
          </Button>
        </>
      ) : (
        <>
          <p className="text-deep-ocean mb-4">
            {bundleEligible
              ? `We couldn't find any class credits on ${customerEmail}, so this place is ${formatPrice(priceInPence)}.`
              : `This class can't be booked with class credits, so this place is ${formatPrice(priceInPence)}.`}
          </p>
          <Button
            type="button"
            onClick={handlePayByCard}
            disabled={loading !== null}
            className="w-full"
          >
            {loading === "card"
              ? "Taking you to payment..."
              : `Pay ${formatPrice(priceInPence)} and take this place`}
          </Button>
        </>
      )}
    </div>
  );
}
