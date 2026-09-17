"use client";

import { createContext, useContext } from "react";

/**
 * True inside a screen still drawn in the light palette.
 *
 * `AppShell paper` sets it, and a sheet or a pinned form bar opened from that
 * screen reads it, because both are rendered outside the body that carries the
 * `.m-paper` class.
 */
export const PaperContext = createContext(false);

export function usePaper(): boolean {
  return useContext(PaperContext);
}
