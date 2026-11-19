import { randomBytes, createECDH, createHash } from "node:crypto";
import cashaddr from "cashaddrjs";
import message from "bitcoinjs-message";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import { KIND, LABEL, bindingMessage, verifyIdentity } from "../lib/protocol.js";
import { createChallengeService } from "../lib/auth.js";

const challengesByOrigin = new Map();
const json = (res, status, value) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
};

function challengeService(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:4104";
  const origin = `${host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}`;
  let service = challengesByOrigin.get(origin);
  if (!service) {
    service = createChallengeService(origin);
    challengesByOrigin.set(origin, service);
  }
  return service;
}

function createDemoEvent() {
  const bch = randomBytes(32);
  const nostr = generateSecretKey();
  try {
    const ecdh = createECDH("secp256k1");
    ecdh.setPrivateKey(bch);
    const pub = ecdh.getPublicKey(null, "compressed");
    const hash = createHash("ripemd160")
      .update(createHash("sha256").update(pub).digest())
      .digest();
    const issued = Math.floor(Date.now() / 1000);
    const binding = {
      version: 1,
      network: "bchtest",
      address: cashaddr.encode("bchtest", "P2PKH", hash),
      nostr: getPublicKey(nostr),
      issued,
      expires: issued + 86400,
    };
    binding.bchSignature = message
      .sign(bindingMessage(binding), bch, true)
      .toString("base64");
    return finalizeEvent(
      {
        kind: KIND,
        tags: [["d", LABEL]],
        created_at: issued,
        content: JSON.stringify(binding),
      },
      nostr,
    );
  } finally {
    bch.fill(0);
    nostr.fill(0);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST required." });
  const action = new URL(req.url, "https://keyweave.invalid")
    .pathname.split("/")
    .filter(Boolean)
    .at(-1);
  try {
    const input = req.body ?? {};
    let result;
    switch (action) {
      case "demo":
        result = createDemoEvent();
        break;
      case "verify":
        result = verifyIdentity(input);
        break;
      case "challenge":
        result = challengeService(req).issue(input);
        break;
      case "authenticate":
        result = challengeService(req).authenticate(input);
        break;
      default:
        return json(res, 404, { error: "Unknown identity API route." });
    }
    return json(res, 200, result);
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}
