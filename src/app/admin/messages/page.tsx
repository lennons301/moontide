"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";
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

type StatusFilter = "all" | "unread" | "read";

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagesPage() {
  const router = useRouter();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchMessages = useCallback(async () => {
    const res = await fetch("/api/admin/messages");
    const data = await res.json();
    setAllMessages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const filters = useMemo(() => {
    const map: Record<string, (m: Message) => boolean> = {};
    if (statusFilter === "unread") map.read = (m) => !m.read;
    if (statusFilter === "read") map.read = (m) => m.read;
    return map;
  }, [statusFilter]);

  const { rows, search, setSearch, total } = useTableControls<Message>({
    rows: allMessages,
    sortKeys: {
      received: (m) => (m.read ? "0_" : "1_") + m.createdAt,
    },
    searchFields: (m) => [m.name, m.email, m.subject, m.message],
    filters,
    defaultSort: { key: "received", direction: "desc" },
  });

  const selected = allMessages.find((m) => m.id === selectedId);

  async function handleOpen(msg: Message) {
    setSelectedId(msg.id);
    if (msg.read) return;
    // Optimistically mark read locally so the list updates immediately.
    setAllMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m)),
    );
    const res = await fetch("/api/admin/messages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msg.id, read: true }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      // Rollback on failure.
      setAllMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: false } : m)),
      );
    }
  }

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

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, subject, or message..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread" },
            { value: "read", label: "Read" },
          ]}
        />
      </AdminTableToolbar>

      {loading ? (
        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center text-soft-moonstone shadow-sm">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center text-soft-moonstone shadow-sm">
          {allMessages.length === 0
            ? "No messages yet."
            : "No messages match the current filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => handleOpen(msg)}
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
