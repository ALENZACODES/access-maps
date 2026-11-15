import type { ObstacleDraft } from "./types";
import { CONDITION_TYPES, validPoint } from "./types";

export interface DraftExport {
  format: "access-maps-obstacle-drafts";
  version: 1;
  exported_at: string;
  drafts: ObstacleDraft[];
}

function validateDraft(draft: ObstacleDraft): void {
  if (
    !draft.id ||
    !CONDITION_TYPES.includes(draft.type) ||
    !validPoint(draft.point) ||
    !Number.isFinite(Date.parse(draft.observed_at)) ||
    !Number.isFinite(Date.parse(draft.observed_at)) ||
    typeof draft.note !== "string" ||
    draft.tier !== 0 ||
    draft.verified_by_person !== true
  ) {
    throw new Error("Draft requires explicit person verification");
  }
  if (
    draft.photo_handle !== undefined &&
    (typeof draft.photo_handle !== "string" || !draft.photo_handle)
  ) {
    throw new Error("Invalid local photo handle");
  }
}

export function serializeDrafts(
  drafts: readonly ObstacleDraft[],
  now: Date = new Date(),
): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid date");
  for (const draft of drafts) validateDraft(draft);
  const payload: DraftExport = {
    format: "access-maps-obstacle-drafts",
    version: 1,
    exported_at: now.toISOString(),
    drafts: drafts.map((draft) => ({ ...draft })),
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

/**
 * Local browser download only. No upload, account or network request.
 * Photo handles are local identifiers; photo bytes are not included.
 */
export function exportDrafts(
  drafts: readonly ObstacleDraft[],
  documentRef: Document = document,
): string {
  const contents = serializeDrafts(drafts);
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  const filename = `obstacle-drafts-${new Date().toISOString().slice(0, 10)}.json`;
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  documentRef.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return filename;
}
