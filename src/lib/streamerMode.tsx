import { createContext, useContext } from "react";

/**
 * Streamer Mode masks friends' real-world names so a shared screen doesn't out
 * the people you go to shows with. The masking itself happens in Rust at the
 * query layer — the frontend never receives a full name while the mode is on,
 * so it can't leak one. This context exists only so the UI can *gate edit
 * affordances*: you can't safely rename a friend whose real name you can't see,
 * so the rename surfaces hide while streamer mode is on.
 */
const StreamerModeContext = createContext(false);

export const StreamerModeProvider = StreamerModeContext.Provider;

/** Whether Streamer Mode is currently on. */
export function useStreamerMode(): boolean {
  return useContext(StreamerModeContext);
}
