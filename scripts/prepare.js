import { readFileSync, writeFileSync } from "node:fs";
import { bindingMessage } from "../lib/protocol.js";
const [address, nostr, output = "unsigned-binding.json"] =
  process.argv.slice(2);
if (
  !/^(bitcoincash|bchtest):/.test(address || "") ||
  !/^[a-f0-9]{64}$/.test(nostr || "")
)
  throw Error(
    "Usage: node scripts/prepare.js full-cashaddress nostr-hex-pubkey [output.json]",
  );
const issued = Math.floor(Date.now() / 1000);
const binding = {
  version: 1,
  network: address.split(":")[0],
  address,
  nostr,
  issued,
  expires: issued + 86400,
};
writeFileSync(output, JSON.stringify(binding, null, 2), { flag: "wx" });
console.log(bindingMessage(binding));
console.log(
  "\nSign only the message above in your BCH wallet; private keys are never required. Unsigned public fields saved to " +
    output,
);
