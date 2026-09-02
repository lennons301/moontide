"use client";

export interface TableState {
  loading: boolean;
  /** Why the load failed, from `useAdminResource`. */
  error: string | null;
  /** Whether the filtered rows came to nothing. */
  isEmpty: boolean;
  /** What to say when they did — "No bookings match the current filters." */
  emptyMessage: string;
}

/**
 * What a table says instead of rows, or null when it has rows to show.
 *
 * One decision, in the order that matters: a failed load is not an empty table,
 * and saying "No bookings yet" when the request was refused is how an expired
 * session used to look like a quiet morning.
 */
export function adminStateMessage(state: TableState): string | null {
  if (state.loading) return "Loading...";
  if (state.error) return state.error;
  if (state.isEmpty) return state.emptyMessage;
  return null;
}

interface TableStateRowProps extends TableState {
  colSpan: number;
}

/** `adminStateMessage` as the single full-width row of a `<tbody>`. */
export function TableStateRow({ colSpan, ...state }: TableStateRowProps) {
  const message = adminStateMessage(state);
  if (message === null) return null;
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`px-4 py-8 text-center ${state.error && !state.loading ? "text-red-600" : "text-soft-moonstone"}`}
      >
        {message}
      </td>
    </tr>
  );
}
