import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassFilterSelect } from "@/components/admin/class-filter-select";

const CLASSES = [
  { id: 3, title: "Prenatal Yoga" },
  { id: 5, title: "Baby Yoga" },
];

describe("ClassFilterSelect", () => {
  it("offers every class, plus all of them", () => {
    render(
      <ClassFilterSelect value="all" onChange={() => {}} classes={CLASSES} />,
    );

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All",
      "Prenatal Yoga",
      "Baby Yoga",
    ]);
  });

  it("reports the chosen class id as a string", () => {
    const onChange = vi.fn();
    render(
      <ClassFilterSelect value="all" onChange={onChange} classes={CLASSES} />,
    );

    fireEvent.change(screen.getByLabelText("Class"), {
      target: { value: "5" },
    });

    expect(onChange).toHaveBeenCalledWith("5");
  });
});
