import type { Entry } from "../model"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

// What an adapter returns for one content block of a record. The parser fills
// in what is the same for every format: id, record, parent link, run, line and
// raw record.
export type DraftEntry = DistributiveOmit<
  Entry,
  "id" | "recordId" | "parentId" | "runId" | "line" | "raw"
>

export type MappedRecord = {
  recordId: string
  // The parent record's id as the log gives it.
  parentRecordId: string | null
  sessionId: string | null
  entries: DraftEntry[]
}

export interface FormatAdapter {
  // Stable, vendor-neutral name, stored with each session.
  name: string
  // Whether this adapter understands the file, judged by its first record.
  detect(record: unknown): boolean
  // Map one parsed record into entries of the neutral model. A record type
  // the adapter does not recognise comes back as one "other" entry.
  mapRecord(record: Record<string, unknown>): MappedRecord
}
