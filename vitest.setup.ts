const root = globalThis as typeof globalThis & { window?: typeof globalThis };
if (typeof root.window === "undefined") {
  root.window = root;
}
