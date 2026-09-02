import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";

describe("AdminTableToolbar", () => {
  it("renders the search box with its placeholder", () => {
    render(
      <AdminTableToolbar
        search="ada"
        onSearchChange={() => {}}
        searchPlaceholder="Search name or email..."
        showing={3}
        total={3}
      />,
    );
    const input = screen.getByPlaceholderText("Search name or email...");
    expect(input).toHaveValue("ada");
  });

  it("only counts rows when some are filtered out", () => {
    const { rerender } = render(
      <AdminTableToolbar
        search=""
        onSearchChange={() => {}}
        showing={5}
        total={5}
      />,
    );
    expect(screen.queryByText(/Showing/)).toBeNull();

    rerender(
      <AdminTableToolbar
        search=""
        onSearchChange={() => {}}
        showing={2}
        total={5}
      />,
    );
    expect(screen.getByText("Showing 2 of 5")).toBeInTheDocument();
  });
});
