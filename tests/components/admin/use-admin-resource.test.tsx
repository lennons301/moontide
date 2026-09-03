import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminResource } from "@/components/admin/admin-fetch";
import { goToLogin } from "@/lib/admin/navigate";
import { stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

const NO_ROWS: { id: number }[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(goToLogin).mockClear();
});

describe("useAdminResource", () => {
  it("loads, then holds the rows", async () => {
    stubFetch({ "GET /api/admin/bundles": { json: [{ id: 1 }] } });

    const { result } = renderHook(() =>
      useAdminResource("/api/admin/bundles", NO_ROWS),
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.error).toBeNull();
  });

  it("keeps the fallback and an error when the load is refused", async () => {
    stubFetch({
      "GET /api/admin/bundles": {
        status: 500,
        json: { error: "Something went wrong" },
      },
    });

    const { result } = renderHook(() =>
      useAdminResource("/api/admin/bundles", NO_ROWS),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Never the parsed error object — that is what the next .map threw on.
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe("Something went wrong");
  });

  it("sends a 401 to the login page", async () => {
    stubFetch({
      "GET /api/admin/bundles": {
        status: 401,
        json: { error: "Unauthorized" },
      },
    });

    const { result } = renderHook(() =>
      useAdminResource("/api/admin/bundles", NO_ROWS),
    );

    await waitFor(() => expect(goToLogin).toHaveBeenCalledTimes(1));
    expect(result.current.data).toEqual([]);
  });

  it("clears the error once a refetch succeeds", async () => {
    let refused = true;
    stubFetch({
      "GET /api/admin/bundles": () =>
        refused
          ? { status: 503, json: { error: "Database is asleep" } }
          : { json: [{ id: 2 }] },
    });

    const { result } = renderHook(() =>
      useAdminResource("/api/admin/bundles", NO_ROWS),
    );
    await waitFor(() =>
      expect(result.current.error).toBe("Database is asleep"),
    );

    refused = false;
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([{ id: 2 }]);
  });

  it("holds the fetch back until it is enabled, then loads again on each open", async () => {
    const fetchMock = stubFetch({
      "GET /api/admin/waitlist": { json: { entries: [] } },
    });

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useAdminResource("/api/admin/waitlist?scheduleId=1", NO_ROWS, {
          enabled: open,
        }),
      { initialProps: { open: false } },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);

    rerender({ open: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
