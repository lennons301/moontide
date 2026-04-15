"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BookBundlePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/book/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bundle",
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

  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue text-center mb-3">
          Six Class Bundle
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />

        <div className="bg-soft-moonstone/30 rounded-lg p-8 text-center mb-8">
          <p className="text-4xl font-heading text-deep-tide-blue mb-2">
            &pound;66
          </p>
          <p className="text-deep-ocean">
            6 classes &middot; Valid for 90 days
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
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

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-bright-orange text-dawn-light hover:bg-bright-orange/90 font-semibold text-base"
          >
            {loading ? "Processing..." : "Purchase Bundle"}
          </Button>
        </form>

        <p className="text-deep-ocean/60 text-sm text-center mt-6 leading-relaxed">
          Your bundle will be linked to your email address. Use the same email
          when booking classes to redeem your credits.
        </p>

        <div className="text-center mt-8">
          <Link
            href="/book"
            className="text-ocean-light-blue hover:text-deep-tide-blue transition-colors text-sm font-medium"
          >
            &larr; Back to classes
          </Link>
        </div>
      </div>
    </section>
  );
}
