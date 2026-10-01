function hexToBytes(hex, expectedChars) {
  const value = String(hex || "");
  const pattern = new RegExp(`^[0-9a-f]{${expectedChars}}$`, "i");
  if (!pattern.test(value)) throw new Error("Invalid Discord signature key material.");
  return new Uint8Array(value.match(/.{2}/g).map(byte => Number.parseInt(byte, 16)));
}

export async function verifyDiscordInteraction(request, publicKeyHex, rawBody) {
  const signature = request.headers.get("X-Signature-Ed25519") || "";
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex, 64), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature, 128),
      new TextEncoder().encode(timestamp + rawBody)
    );
  } catch (error) {
    console.warn("Discord signature verification failed", error);
    return false;
  }
}
