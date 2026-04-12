import Link from "next/link";

function MoonCycle() {
  // 6 phases on a circle, radius 20, centre 28,28, icon radius 5
  const r = 18;
  const cx = 28;
  const cy = 28;
  // Positions: 12, 2, 4, 6, 8, 10 o'clock (angles: -90, -30, 30, 90, 150, 210 degrees)
  const positions = [
    { angle: -90, label: "Full moon" },
    { angle: -30, label: "Waxing half" },
    { angle: 30, label: "Waxing crescent" },
    { angle: 90, label: "New moon" },
    { angle: 150, label: "Waning crescent" },
    { angle: 210, label: "Waning half" },
  ];

  const points = positions.map((p) => ({
    x: cx + r * Math.cos((p.angle * Math.PI) / 180),
    y: cy + r * Math.sin((p.angle * Math.PI) / 180),
    label: p.label,
  }));

  const s = 5; // moon icon radius

  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      className="mb-3 text-deep-current"
    >
      <title>Six moon phases in a circle</title>
      {/* Full moon — 12 o'clock: filled circle */}
      <circle cx={points[0].x} cy={points[0].y} r={s} fill="currentColor" />

      {/* Waxing half — 2 o'clock: right half filled */}
      <g transform={`translate(${points[1].x - s},${points[1].y - s})`}>
        <clipPath id="waxhalf">
          <rect x={s} y="0" width={s} height={s * 2} />
        </clipPath>
        <circle
          cx={s}
          cy={s}
          r={s}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle
          cx={s}
          cy={s}
          r={s}
          fill="currentColor"
          clipPath="url(#waxhalf)"
        />
      </g>

      {/* Waxing crescent — 4 o'clock: thin right sliver */}
      <g transform={`translate(${points[2].x - s},${points[2].y - s})`}>
        <circle
          cx={s}
          cy={s}
          r={s}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d={`M${s},0 A${s},${s} 0 0,1 ${s},${s * 2} A${s * 0.5},${s} 0 0,0 ${s},0`}
          fill="currentColor"
        />
      </g>

      {/* New moon — 6 o'clock: empty circle */}
      <circle
        cx={points[3].x}
        cy={points[3].y}
        r={s}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />

      {/* Waning crescent — 8 o'clock: thin left sliver */}
      <g transform={`translate(${points[4].x - s},${points[4].y - s})`}>
        <circle
          cx={s}
          cy={s}
          r={s}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d={`M${s},0 A${s},${s} 0 0,0 ${s},${s * 2} A${s * 0.5},${s} 0 0,1 ${s},0`}
          fill="currentColor"
        />
      </g>

      {/* Waning half — 10 o'clock: left half filled */}
      <g transform={`translate(${points[5].x - s},${points[5].y - s})`}>
        <clipPath id="wanhalf">
          <rect x="0" y="0" width={s} height={s * 2} />
        </clipPath>
        <circle
          cx={s}
          cy={s}
          r={s}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle
          cx={s}
          cy={s}
          r={s}
          fill="currentColor"
          clipPath="url(#wanhalf)"
        />
      </g>
    </svg>
  );
}

export function BookingOptions() {
  return (
    <section className="bg-white py-16 px-6 border-t border-driftwood">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-deep-current mb-1">
          Book a class
        </h2>
        <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-8" />
        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto items-end">
          <Link
            href="/book"
            className="flex flex-col items-center justify-end p-6 border border-driftwood rounded-lg hover:border-lunar-gold transition-colors"
          >
            <svg
              width="56"
              height="56"
              viewBox="0 0 56 56"
              className="mb-3 text-deep-current"
            >
              <title>Full moon</title>
              <circle cx="28" cy="28" r="18" fill="currentColor" />
            </svg>
            <span className="text-sm font-semibold text-deep-current">
              Individual Class
            </span>
          </Link>
          <Link
            href="/book/bundle"
            className="flex flex-col items-center justify-end p-6 border border-driftwood rounded-lg hover:border-lunar-gold transition-colors"
          >
            <MoonCycle />
            <span className="text-sm font-semibold text-deep-current">
              Six Class Bundle
            </span>
          </Link>
        </div>
        <p className="mt-6 text-sm text-deep-ocean">
          For all other enquiries, please{" "}
          <Link
            href="/contact"
            className="text-lunar-gold underline hover:text-lunar-gold/80"
          >
            get in touch
          </Link>
        </p>
      </div>
    </section>
  );
}
