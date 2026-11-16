import { sessionJsonl } from "./session-jsonl"
import type { FormatAdapter } from "./types"

// The one place that lists supported formats. Detection tries them in order.
export const adapters: readonly FormatAdapter[] = [sessionJsonl]

export type { DraftEntry, FormatAdapter, MappedRecord } from "./types"
