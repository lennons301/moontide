"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminAlert } from "@/components/admin/admin-alert";
import { mutateAdmin, useAdminResource } from "@/components/admin/admin-fetch";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { formatDateTime } from "@/components/admin/format-date";
import { PillGroup } from "@/components/admin/pill-group";
import { buildAdminTableFilters } from "@/components/admin/table-filters";
import { adminStateMessage } from "@/components/admin/table-state";
import { useTableControls } from "@/components/admin/use-table-controls";
import { Button } from "@/components/ui/button";
import type { MessageRow } from "@/lib/admin/rows";

type Message = MessageRow;

type StatusFilter = "all" | "unread" | "read";

const NO_MESSAGES: Message[] = [];

export default function MessagesPage() {
  const router = useRouter();
  const {
    data: allMessages,
    loading,
    error: loadError,
  } = useAdminResource<Message[]>("/api/admin/messages", NO_MESSAGES);
  // Read/unread is this table's status, so it goes through the shared filters.
  const [optimisticReadIds, setOptimisticReadIds] = useState<number[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filters = useMemo(
    () =>
      buildAdminTableFilters<Message>(
        { status: statusFilter },
        { status: (m) => (m.read ? "read" : "unread") },
      ),
    [statusFilter],
  );

  // Marking one read is optimistic: an overlay on the loaded rows rather than a
  // write back into them, so a refetch cannot be undone by stale local state.
  const messages = useMemo(
    () =>
      optimisticReadIds.length === 0
        ? allMessages
        : allMessages.map((m) =>
            optimisticReadIds.includes(m.id) ? { ...m, read: true } : m,
          ),
    [allMessages, optimisticReadIds],
  );

  const { rows, search, setSearch, total } = useTableControls<Message>({
    rows: messages,
    sortKeys: {
      received: (m) => (m.read ? "0_" : "1_") + m.createdAt,
    },
    searchFields: (m) => [m.name, m.email, m.subject, m.message],
    filters,
    defaultSort: { key: "received", direction: "desc" },
  });

  // The list is panels rather than a table, but it answers the same question
  // in the same order: loading, then why not, then empty.
  const stateMessage = adminStateMessage({
    loading,
    error: loadError,
    isEmpty: rows.length === 0,
    emptyMessage:
      allMessages.length === 0
        ? "No messages yet."
        : "No messages match the current filters.",
  });

  const selected = messages.find((m) => m.id === selectedId);

  async function handleOpen(msg: Message) {
    setSelectedId(msg.id);
    if (msg.read) return;
    setActionError(null);
    // Optimistically mark read locally so the list updates immediately.
    setOptimisticReadIds((prev) => [...prev, msg.id]);
    const result = await mutateAdmin("/api/admin/messages", {
      method: "PUT",
      body: { id: msg.id, read: true },
    });
    if (result.ok) {
      router.refresh();
      return;
    }
    // Rollback on failure, and say why it did not stick.
    setOptimisticReadIds((prev) => prev.filter((id) => id !== msg.id));
    setActionError(result.error);
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
            {formatDateTime(selected.createdAt)}
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

      <AdminAlert message={actionError} className="mb-4" />

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

      {stateMessage !== null ? (
        <div
          className={`rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center shadow-sm ${
            loadError && !loading ? "text-red-600" : "text-soft-moonstone"
          }`}
        >
          {stateMessage}
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
                  {formatDateTime(msg.createdAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
