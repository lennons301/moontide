/**
 * Vite's `import.meta.glob`, typed for the one use this suite makes of it.
 *
 * `vite/client` would declare it, but vite is only a transitive dependency
 * here, so its types are not resolvable from the project root. The call has to
 * stay a literal `import.meta.glob(...)` for Vite to transform it, which rules
 * out casting at the call site.
 */
interface ImportMeta {
  glob(
    pattern: string,
    options: { eager: true },
  ): Record<string, Record<string, unknown>>;
  /** The same sweep, reading the files as text rather than importing them. */
  glob(
    pattern: string,
    options: { eager: true; query: "?raw"; import: "default" },
  ): Record<string, string>;
}
