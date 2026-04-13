import { commands as raw } from "@/bindings";

// tauri-specta wraps every Rust `Result<T, E>` as a TS
// `{ status: "ok"; data } | { status: "error"; error }` and resolves the
// promise in both cases. This Proxy reverses that for consumers: on "ok"
// it returns the unwrapped data, on "error" it throws — matching the
// old hand-written api.ts behavior, so call sites can stay terse
// (`const events = await commands.queryEvents({...})`) instead of
// manually destructuring Result at every call site.
//
// Commands that return plain values (no Rust Result — e.g. `toggle_b2b`,
// which returns `Vec<ArtistEntry>` directly) are passed through unchanged;
// the `"status" in value` check keeps the wrapper agnostic.

type UnwrapResult<T> = T extends Promise<
  { status: "ok"; data: infer D } | { status: "error"; error: unknown }
>
  ? Promise<D>
  : T;

type UnwrappedCommands = {
  [K in keyof typeof raw]: (typeof raw)[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => UnwrapResult<R>
    : (typeof raw)[K];
};

function unwrap(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    "data" in value
  ) {
    const r = value as { status: string; data?: unknown; error?: unknown };
    if (r.status === "error") {
      throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error));
    }
    return r.data;
  }
  return value;
}

export const commands: UnwrappedCommands = new Proxy(raw, {
  get(target, prop, receiver) {
    const original = Reflect.get(target, prop, receiver);
    if (typeof original !== "function") return original;
    return async (...args: unknown[]) => unwrap(await original.apply(target, args));
  },
}) as unknown as UnwrappedCommands;
