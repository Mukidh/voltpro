export const MAX_CONTACT_BODY_BYTES = 8192;

export async function readLimitedBody(req, maxBytes = MAX_CONTACT_BODY_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("payload too large");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}
