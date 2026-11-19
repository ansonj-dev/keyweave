import { readFileSync } from "node:fs";
import { verifyIdentity } from "../lib/protocol.js";
if (!process.argv[2]) throw Error("Usage: node scripts/verify.js binding.json");
console.log(
  JSON.stringify(
    verifyIdentity(JSON.parse(readFileSync(process.argv[2], "utf8"))),
    null,
    2,
  ),
);
