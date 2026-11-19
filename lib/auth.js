import { randomBytes } from "node:crypto";
import { verifyEvent } from "nostr-tools/pure";
import { verifyIdentity } from "./protocol.js";

// Each independent relying application owns its nonce store and public origin.
export function createChallengeService(origin) {
  const challenges = new Map();
  return {
    issue(input, now = Math.floor(Date.now() / 1000)) {
      const identity = verifyIdentity(input, now);
      for (const [key, value] of challenges)
        if (value.expires <= now) challenges.delete(key);
      if (challenges.size >= 1000) throw Error("Challenge capacity reached");
      const nonce = randomBytes(32).toString("hex"), expires = now + 300;
      const content = JSON.stringify({protocol:"bch-nostr-auth:v1",domain:origin,nonce,binding:identity.eventId,expires});
      challenges.set(nonce, {...identity,bindingExpires:identity.expires,content,expires});
      return {kind:22242,content,tags:[["relay",origin],["challenge",nonce]],created_at:now};
    },
    authenticate(input, now = Math.floor(Date.now() / 1000)) {
      const event = JSON.parse(JSON.stringify(input));
      if (!verifyEvent(event) || event.kind !== 22242) throw Error("Invalid authentication event");
      const payload = JSON.parse(event.content), pending = challenges.get(payload.nonce);
      if (!pending || pending.expires <= now || pending.bindingExpires <= now ||
          pending.content !== event.content || pending.nostr !== event.pubkey ||
          Math.abs(event.created_at - now) > 300)
        throw Error("Challenge expired, consumed, or mismatched");
      challenges.delete(payload.nonce);
      return {authenticated:true,address:pending.address,nostr:event.pubkey,
        note:"One-time proof accepted; this demo does not create a session cookie."};
    },
  };
}
