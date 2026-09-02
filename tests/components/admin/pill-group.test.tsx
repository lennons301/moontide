import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PillGroup } from "@/components/admin/pill-group";

const OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "open" as const, label: "Open" },
  { value: "full" as const, label: "Full" },
];

describe("PillGroup", () => {
  it("labels the group and renders every option", () => {
    render(
      <PillGroup
        label="Status"
        value="all"
        onChange={() => {}}
        options={OPTIONS}
      />,
    );
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "All",
      "Open",
      "Full",
    ]);
  });

  it("marks only the selected option", () => {
    render(
      <PillGroup
        label="Status"
        value="open"
        onChange={() => {}}
        options={OPTIONS}
      />,
    );
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass(
      "bg-deep-tide-blue",
    );
    expect(screen.getByRole("button", { name: "All" })).not.toHaveClass(
      "bg-deep-tide-blue",
    );
  });

  it("reports the clicked value, including the one already selected", () => {
    const onChange = vi.fn();
    render(
      <PillGroup
        label="Status"
        value="open"
        onChange={onChange}
        options={OPTIONS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Full" }));
    expect(onChange).toHaveBeenCalledWith("full");

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onChange).toHaveBeenLastCalledWith("open");
  });
});
