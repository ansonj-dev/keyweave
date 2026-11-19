import cashaddr from "cashaddrjs";
import bs58check from "bs58check";
import message from "bitcoinjs-message";
import secp from "secp256k1";
import { verifyEvent } from "nostr-tools/pure";

export const KIND = 30078;
export const LABEL = "bch-nostr-binding:v1";
export function verifyRevocation(
  event,
  binding,
  now = Math.floor(Date.now() / 1000),
) {
  const copy = JSON.parse(JSON.stringify(event));
  if (
    !verifyEvent(copy) ||
    copy.kind !== 5 ||
    copy.pubkey !== binding.nostr ||
    copy.created_at > now + 60 ||
    !copy.tags.some((t) => t[0] === "e" && t[1] === binding.eventId)
  )
    throw Error("Not an authorized NIP-09 deletion request for this binding");
  return { eventId: copy.id, createdAt: copy.created_at };
}
export function verifyIdentity(input, now = Math.floor(Date.now() / 1000)) {
  const identity = verifyBinding(input.binding ?? input, now);
  const notices = Array.isArray(input.revocations) ? input.revocations : [];
  const authorized = [];
  for (const notice of notices) {
    try {
      authorized.push(verifyRevocation(notice, identity, now));
    } catch {
      /* Unrelated or forged relay results do not revoke an identity. */
    }
  }
  if (authorized.length)
    throw Error(
      `Binding revoked by signed NIP-09 request ${authorized[0].eventId}`,
    );
  return {
    ...identity,
    proofValid: true,
    revocationEvidenceChecked: notices.length,
    freshness:
      "Only supplied evidence was checked. A relay can withhold newer bindings or deletion requests.",
  };
}
export function bindingMessage(b) {
  return [
    "BCH Nostr identity binding v1",
    `network:${b.network}`,
    `address:${b.address}`,
    `nostr:${b.nostr}`,
    `issued:${b.issued}`,
    `expires:${b.expires}`,
  ].join("\n");
}
export function verifyBinding(event, now = Math.floor(Date.now() / 1000)) {
  // Deserialize to avoid accepting a library verification cache on a mutated object.
  event = JSON.parse(JSON.stringify(event));
  if (!verifyEvent(event) || event.kind !== KIND)
    throw Error("Invalid Nostr event signature or kind");
  if (
    event.tags.filter((t) => t[0] === "d").length !== 1 ||
    !event.tags.some((t) => t[0] === "d" && t[1] === LABEL)
  )
    throw Error("Missing binding discriminator");
  const b = JSON.parse(event.content);
  if (
    b.version !== 1 ||
    b.nostr !== event.pubkey ||
    !["bitcoincash", "bchtest"].includes(b.network)
  )
    throw Error("Binding identity mismatch");
  if (
    !Number.isSafeInteger(b.issued) ||
    !Number.isSafeInteger(b.expires) ||
    b.issued > now + 60 ||
    b.expires <= now ||
    b.expires <= b.issued ||
    event.created_at !== b.issued
  )
    throw Error("Invalid binding lifetime");
  const decoded = cashaddr.decode(b.address);
  if (
    decoded.prefix !== b.network ||
    decoded.type !== "P2PKH" ||
    decoded.hash.length !== 20
  )
    throw Error("Only canonical P2PKH CashAddresses are supported");
  if (cashaddr.encode(decoded.prefix, decoded.type, decoded.hash) !== b.address)
    throw Error("Noncanonical address");
  const legacy = bs58check.encode(
    Buffer.concat([
      Buffer.from([b.network === "bitcoincash" ? 0 : 111]),
      Buffer.from(decoded.hash),
    ]),
  );
  if (!message.verify(bindingMessage(b), legacy, b.bchSignature))
    throw Error("BCH ownership signature failed");
  const compact = Buffer.from(b.bchSignature, "base64");
  if (compact.length !== 65 || compact[0] < 27 || compact[0] > 34)
    throw Error("Unsupported BCH signature header");
  const publicKey = secp.ecdsaRecover(
    compact.subarray(1),
    (compact[0] - 27) & 3,
    message.magicHash(bindingMessage(b)),
    true,
  );
  if (Buffer.from(publicKey).subarray(1).toString("hex") === b.nostr)
    throw Error("Use independent BCH and Nostr keys");
  return {
    address: b.address,
    nostr: b.nostr,
    expires: b.expires,
    eventId: event.id,
    network: b.network,
  };
}
