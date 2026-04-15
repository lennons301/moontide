"use client";

import { useCallback, useEffect, useState } from "react";

interface BookingRow {
  bookings: {
    id: number;
    scheduleId: number;
    customerName: string;
    customerEmail: string;
    stripePaymentId: string | null;
    bundleId: number | null;
    status: string;
    createdAt: string;
    emailSent: boolean;
  };
  schedules: {
    id: number;
    classId: number;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    bookedCount: number;
    location: string | null;
    status: string;
  };
  classes: {
    id: number;
    slug: string;
    title: string;
    category: string;
    bookingType: string;
    active: boolean;
    priceInPence: number;
  };
}

export default function BookingsPage() {
  const [bookingList, setBookingList] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    const res = await fetch("/api/admin/bookings");
    const data = await res.json();
    setBookingList(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      confirmed: "bg-seagrass/20 text-seagrass",
      cancelled: "bg-red-100 text-red-700",
      waitlisted: "bg-ocean-light-blue/20 text-ocean-light-blue",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  }

  function paymentType(row: BookingRow) {
    return row.bookings.bundleId ? "Bundle" : "Stripe";
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bookings
      </h1>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light text-xs uppercase tracking-wider text-deep-ocean">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  Loading...
                </td>
              </tr>
            ) : bookingList.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No bookings yet.
                </td>
              </tr>
            ) : (
              bookingList.map((item) => (
                <tr
                  key={item.bookings.id}
                  className="hover:bg-ocean-light-blue/10"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-deep-tide-blue">
                      {item.bookings.customerName}
                    </div>
                    <div className="text-xs text-deep-ocean/60">
                      {item.bookings.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {item.classes.title}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(item.schedules.date)}
                  </td>
                  <td className="px-4 py-3">
                    {item.schedules.startTime} - {item.schedules.endTime}
                  </td>
                  <td className="px-4 py-3">{paymentType(item)}</td>
                  <td className="px-4 py-3">
                    {statusBadge(item.bookings.status)}
                    {!item.bookings.emailSent && (
                      <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange">
                        email unsent
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
