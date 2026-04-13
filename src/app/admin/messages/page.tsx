"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Message {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchMessages = useCallback(async () => {
    const res = await fetch("/api/admin/messages");
    const data = await res.json();
    setMessages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const selected = messages.find((m) => m.id === selectedId);

  if (selected) {
    return (
      <div>
        <Button
          variant="outline"
          onClick={() => setSelectedId(null)}
          className="mb-4"
        >
          &larr; Back to messages
        </Button>

        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-deep-tide-blue">
            {selected.subject}
          </h2>
          <div className="mt-2 text-sm text-deep-ocean/60">
            <span className="font-medium text-deep-ocean">{selected.name}</span>{" "}
            &lt;{selected.email}&gt;
          </div>
          <div className="mt-1 text-xs text-deep-ocean/40">
            {formatDate(selected.createdAt)}
          </div>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-deep-ocean">
            {selected.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Messages
      </h1>

      {loading ? (
        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center text-soft-moonstone shadow-sm">
          Loading...
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center text-soft-moonstone shadow-sm">
          No messages yet.
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => setSelectedId(msg.id)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                msg.read
                  ? "border-soft-moonstone/30 bg-white hover:bg-dawn-light"
                  : "border-bright-orange/30 bg-bright-orange/5 hover:bg-bright-orange/10"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm ${msg.read ? "text-deep-ocean" : "font-bold text-deep-tide-blue"}`}
                  >
                    {msg.subject}
                  </div>
                  <div className="mt-1 truncate text-xs text-deep-ocean/60">
                    {msg.name} &lt;{msg.email}&gt;
                  </div>
                </div>
                <div className="shrink-0 text-xs text-deep-ocean/40">
                  {formatDate(msg.createdAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
