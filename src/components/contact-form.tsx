"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContactFormProps {
  defaultSubject?: string;
}

export function ContactForm({ defaultSubject }: ContactFormProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    const form = e.currentTarget;
    const data = new FormData(form);

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        subject: data.get("subject"),
        message: data.get("message"),
      }),
    });

    if (res.ok) {
      setStatus("sent");
      form.reset();
    } else {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center py-8">
        <p className="text-seagrass font-semibold mb-2">Message sent</p>
        <p className="text-deep-ocean text-sm">
          Thank you — I&apos;ll be in touch soon.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm text-lunar-gold underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          required
          defaultValue={defaultSubject}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="message">Your message</Label>
        <Textarea
          id="message"
          name="message"
          required
          rows={5}
          className="mt-1"
        />
      </div>
      <Button
        type="submit"
        disabled={status === "sending"}
        className="w-full bg-lunar-gold text-foam-white hover:bg-lunar-gold/90 font-semibold"
      >
        {status === "sending" ? "Sending..." : "Send Message"}
      </Button>
      {status === "error" && (
        <p className="text-red-600 text-sm text-center">
          Something went wrong. Please try again or email directly.
        </p>
      )}
    </form>
  );
}
