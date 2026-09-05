import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge, statusBadgeClass } from "@/components/admin/status-badge";

describe("StatusBadge", () => {
  it("shows the status as its own label", () => {
    render(<StatusBadge status="waitlisted" />);
    expect(screen.getByText("waitlisted")).toBeInTheDocument();
  });

  it("colours each of the four status vocabularies", () => {
    // Schedules, bookings, bundles and classes share one map because their
    // statuses never collide; a regression that dropped one would show up as
    // grey.
    for (const status of [
      "open",
      "closed",
      "cancelled",
      "confirmed",
      "held",
      "released",
      "waitlisted",
      "active",
      "expired",
      "exhausted",
      "inactive",
    ]) {
      expect(statusBadgeClass(status)).not.toBe("bg-gray-100 text-gray-600");
    }
  });

  it("falls back to grey for a status it has never seen", () => {
    expect(statusBadgeClass("refunded")).toBe("bg-gray-100 text-gray-600");
    render(<StatusBadge status="refunded" />);
    expect(screen.getByText("refunded")).toHaveClass("bg-gray-100");
  });
});
