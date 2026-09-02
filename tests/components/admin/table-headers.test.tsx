import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PlainHeader,
  SortableHead,
  SortHeader,
} from "@/components/admin/table-headers";
import type { SortState } from "@/components/admin/use-table-controls";

function renderHead(sort: SortState, toggleSort = vi.fn()) {
  render(
    <table>
      <SortableHead sort={sort} toggleSort={toggleSort}>
        <SortHeader label="Customer" sortKey="customer" />
        <SortHeader label="Date" sortKey="date" />
        <PlainHeader label="Actions" />
      </SortableHead>
    </table>,
  );
  return toggleSort;
}

describe("SortableHead", () => {
  it("renders one header cell per child, in order", () => {
    renderHead({ key: "date", direction: "asc" });
    expect(
      screen.getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["Customer", "Date↑", "Actions"]);
  });

  it("marks the active column with its direction and leaves the rest bare", () => {
    renderHead({ key: "date", direction: "desc" });
    expect(screen.getByRole("button", { name: /Date/ })).toHaveTextContent(
      "Date↓",
    );
    expect(screen.getByRole("button", { name: /Customer/ })).toHaveTextContent(
      "Customer",
    );
  });

  it("toggles by sort key without the page wiring a handler", () => {
    const toggleSort = renderHead({ key: "date", direction: "asc" });
    fireEvent.click(screen.getByRole("button", { name: /Customer/ }));
    expect(toggleSort).toHaveBeenCalledWith("customer");
  });

  it("gives a plain column no way to be sorted by", () => {
    renderHead({ key: "date", direction: "asc" });
    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
  });
});

describe("SortHeader", () => {
  it("refuses to render outside a SortableHead rather than sorting nothing", () => {
    // React logs the thrown error before it propagates; silence that so a
    // deliberate failure does not read as a broken test run.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() =>
      render(
        <table>
          <thead>
            <tr>
              <SortHeader label="Customer" sortKey="customer" />
            </tr>
          </thead>
        </table>,
      ),
    ).toThrow(/SortableHead/);
    consoleError.mockRestore();
  });
});
