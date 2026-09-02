"use client";

interface ClassOption {
  id: number;
  title: string;
}

interface ClassFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  classes: ClassOption[];
}

/**
 * The class filter, beside the pills in an admin toolbar. A `<select>` rather
 * than a `PillGroup` because the list is as long as the class list.
 */
export function ClassFilterSelect({
  value,
  onChange,
  classes,
}: ClassFilterSelectProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">Class:</span>
      <select
        aria-label="Class"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-full bg-soft-moonstone/30 px-2.5 text-xs text-deep-ocean focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        <option value="all">All</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}
