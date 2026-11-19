import express from "express";
import { createServer } from "vite";
import { randomBytes, createECDH, createHash } from "node:crypto";
import cashaddr from "cashaddrjs";
import message from "bitcoinjs-message";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import { KIND, LABEL, bindingMessage, verifyIdentity } from "./lib/protocol.js";
import { createChallengeService } from "./lib/auth.js";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const origin = process.env.PUBLIC_ORIGIN || "http://localhost:4104";
const auth = createChallengeService(origin);
app.post("/api/verify", (req, res, next) => {
  try {
    res.json(verifyIdentity(req.body));
  } catch (e) {
    next(e);
  }
});
app.post("/api/challenge", (req, res, next) => {
  try {
    res.json(auth.issue(req.body));
  } catch (e) {
    next(e);
  }
});
app.post("/api/authenticate", (req, res, next) => {
  try {
    res.json(auth.authenticate(req.body));
  } catch (e) {
    next(e);
  }
});
app.post("/api/demo", (req, res) => {
  const bch = randomBytes(32),
    nostr = generateSecretKey();
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
  const event = finalizeEvent(
    {
      kind: KIND,
      tags: [["d", LABEL]],
      created_at: issued,
      content: JSON.stringify(binding),
    },
    nostr,
  );
  bch.fill(0);
  nostr.fill(0);
  res.json(event);
});
app.use((err, req, res, next) => res.status(400).json({ error: err.message }));
app.use(
  (
    await createServer({
      server: { middlewareMode: true, hmr: { port: 24104 } },
      appType: "spa",
    })
  ).middlewares,
);
app.listen(4104, "127.0.0.1", () =>
  console.log("Keyweave: http://localhost:4104"),
);
