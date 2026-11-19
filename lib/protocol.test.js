import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHash } from "node:crypto";
import cashaddr from "cashaddrjs";
import message from "bitcoinjs-message";
import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { bindingMessage, verifyBinding, verifyIdentity, KIND, LABEL } from "./protocol.js";
import { createChallengeService } from "./auth.js";
// Deterministic, unfunded test keys. Never used outside this offline test process.
const key=(n)=>Buffer.from(n.toString(16).padStart(64,"0"),"hex");
const now=1795046400, bch=key(1), nostr=key(2), stranger=key(3);
function fixture({sameKey=false,expires=now+3600}={}) {
  const ecdh=createECDH("secp256k1"); ecdh.setPrivateKey(bch);
  const hash=createHash("ripemd160").update(createHash("sha256").update(ecdh.getPublicKey(null,"compressed")).digest()).digest();
  const owner=sameKey?bch:nostr;
  const b={version:1,network:"bchtest",address:cashaddr.encode("bchtest","P2PKH",hash),nostr:getPublicKey(owner),issued:now,expires};
  b.bchSignature=message.sign(bindingMessage(b),bch,true).toString("base64");
  return finalizeEvent({kind:KIND,tags:[["d",LABEL]],created_at:now,content:JSON.stringify(b)},owner);
}
const revoke=(event,owner=nostr)=>finalizeEvent({kind:5,tags:[["e",event.id]],created_at:now,content:"Revoked"},owner);
test("independent BCH and Nostr signatures verify without network or identity provider",()=>{
  const event=fixture(), verified=verifyIdentity(event,now);
  assert.equal(verified.nostr,getPublicKey(nostr)); assert.equal(verified.proofValid,true);
  assert.equal(verified.network,"bchtest");
});
test("same key, expired binding, forged BCH proof and cached Nostr mutation are rejected",()=>{
  assert.throws(()=>verifyBinding(fixture({sameKey:true}),now),/independent/);
  assert.throws(()=>verifyBinding(fixture({expires:now}),now),/lifetime/);
  const e=fixture(); assert.equal(verifyEvent(e),true); e.content="mutated";
  assert.throws(()=>verifyBinding(e,now),/signature/);
  const good=fixture(), b=JSON.parse(good.content); b.address=fixture({sameKey:true}).pubkey;
  const bad=finalizeEvent({...good,content:JSON.stringify(b)},nostr);
  assert.throws(()=>verifyBinding(bad,now));
  const forged=JSON.parse(good.content); forged.bchSignature=message.sign(bindingMessage(forged),stranger,true).toString("base64");
  assert.throws(()=>verifyBinding(finalizeEvent({...good,content:JSON.stringify(forged)},nostr),now),/BCH ownership/);
});
test("only authorized exact-event deletion evidence revokes binding",()=>{
  const e=fixture();
  assert.throws(()=>verifyIdentity({binding:e,revocations:[revoke(e)]},now),/revoked/);
  assert.equal(verifyIdentity({binding:e,revocations:[revoke(e,stranger)]},now).proofValid,true);
  const unrelated=finalizeEvent({kind:5,tags:[["e","a".repeat(64)]],created_at:now,content:""},nostr);
  assert.equal(verifyIdentity({binding:e,revocations:[unrelated]},now).proofValid,true);
});
test("challenge succeeds once and rejects replay, wrong key, domain and expired nonce",()=>{
  const service=createChallengeService("https://example.test"), e=fixture();
  const challenge=service.issue(e,now), signed=finalizeEvent(challenge,nostr);
  assert.equal(service.authenticate(signed,now).authenticated,true);
  assert.throws(()=>service.authenticate(signed,now),/consumed/);
  const fresh=service.issue(e,now);
  assert.throws(()=>service.authenticate(finalizeEvent(fresh,stranger),now),/mismatched/);
  const payload=JSON.parse(fresh.content);payload.domain="https://other.test";
  assert.throws(()=>service.authenticate(finalizeEvent({...fresh,content:JSON.stringify(payload)},nostr),now),/mismatched/);
  assert.throws(()=>service.authenticate(finalizeEvent(fresh,nostr),now+300),/expired/);
});
test("binding expiry and supplied revocation remain authentication gates",()=>{
  const service=createChallengeService("https://example.test"),e=fixture({expires:now+30});
  const signed=finalizeEvent(service.issue(e,now),nostr);
  assert.throws(()=>service.authenticate(signed,now+30),/expired/);
  assert.throws(()=>service.issue({binding:e,revocations:[revoke(e)]},now),/revoked/);
});
