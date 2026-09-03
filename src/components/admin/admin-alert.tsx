"use client";

interface AdminAlertProps {
  /** Null when there is nothing wrong — the banner then renders nothing. */
  message: string | null;
  className?: string;
}

/**
 * What went wrong, said on the page. The admin used to say it in a
 * `window.alert`, which stops the page to be dismissed and cannot be read back
 * once it is.
 */
export function AdminAlert({ message, className = "" }: AdminAlertProps) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={`rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}
    >
      {message}
    </p>
  );
}
