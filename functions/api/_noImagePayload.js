// Submission rows hold links, never images. A plugin screenshot lives only in
// website_store, under event-submission-image:<submissionId>, until the drop is
// reviewed (the Discord bot deletes it on decision). These checks stop any
// other path copying the bytes into a submission row instead.

// Leading bytes of PNG, JPEG, GIF and WEBP files, as they appear in base64.
const BASE64_IMAGE_SIGNATURES = ["iVBORw0KGgo", "/9j/", "R0lGOD", "UklGR"];

export function containsImagePayload(value) {
  if (Array.isArray(value)) return value.some(containsImagePayload);
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (/^data:/i.test(text)) return true;
  return BASE64_IMAGE_SIGNATURES.some(signature => text.startsWith(signature));
}

export class ImagePayloadError extends Error {
  constructor(field) {
    super(`Refusing to store image data in ironkin_event_submissions.${field}.`);
    this.name = "ImagePayloadError";
    this.field = field;
  }
}

export function assertNoImagePayload(fields) {
  for (const [field, value] of Object.entries(fields || {})) {
    if (containsImagePayload(value)) throw new ImagePayloadError(field);
  }
  const proofUrl = String(fields?.proof_url ?? "").trim();
  if (proofUrl && !/^https?:\/\//i.test(proofUrl)) throw new ImagePayloadError("proof_url");
}
