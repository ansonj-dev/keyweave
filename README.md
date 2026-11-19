# Keyweave

A Bitcoin Cash / Nostr identity binding and independent verifier for the Paytaca identity bounty.

## Bounty readiness

**Status: working prototype; live demonstration and binding publication are outstanding.** The code supports separate BCH and Nostr proofs, decentralized relay discovery, independent verification, revocation evidence, and challenge-response. No participant wallet has signed a binding, no binding has been published to a relay, and no independent client has discovered a live binding. The public source is at [github.com/ansonj-dev/keyweave](https://github.com/ansonj-dev/keyweave); no hosted demo is available yet.

The [Decentralized Identity bounty](https://bchblaze.com/bounties/decentralized-identity/) asks for a self-sovereign BCH/Nostr link that can be discovered and verified without a central identity provider. To demonstrate that end to end, the identity owner must sign with separate keys, choose whether to publish the public association, and verify discovery and authentication from an independent client. See the [criterion audit](../AUDIT-00-01-04.md) before publishing. Relay publication exposes the BCH address and Nostr key together.

## Run

Requires Node 24. Install with `npm ci`, run `npm run dev`, then open http://localhost:4104. `npm run build` produces the browser bundle. The local Express service runs the independent verifier and example challenge service; relay discovery does not depend on a proprietary identity database.

## Demo

1. Choose **Generate a demo binding**. The server generates two independent random keys, signs the same association with both and discards the private keys. The returned public event is verified cryptographically. No funds are needed.
2. Export the event and paste it into another running copy to verify it independently. A standalone verifier is also available: `node scripts/verify.js binding.json`.
3. For a real identity, install a NIP-07 extension. Enter your full P2PKH CashAddress, prepare the binding message, and sign the exact bytes in your BCH wallet. Paste the Base64 compact message signature, then sign with the Nostr extension.
4. Publish only after inspecting the binding. Relay publication is public and links the address with the Nostr key. Enter that public key in a second client to discover and verify it.
5. Authenticate with the same Nostr extension. The verifier issues a random 32-byte challenge scoped to the binding event ID and configured origin. Successful use consumes it. Demo keys are discarded, so the generated demo cannot authenticate.

## Protocol

The BCH signature is the standard compact recoverable Bitcoin Signed Message signature over the UTF-8 text produced by `bindingMessage()` in `lib/protocol.js`. The signature is verified against a P2PKH hash decoded from a canonical CashAddress; no address string alone proves ownership. The Nostr identity signs a NIP-01 event of kind 30078, with the NIP-78 replaceable discriminator `bch-nostr-binding:v1`. The JSON content includes the BCH proof, network, public key, creation time and expiry. This is an application protocol using existing standards, not a registered NIP or a W3C DID method.

Verification recomputes the event ID/signature, verifies time bounds and address/network, verifies the BCH signature, and recovers the BCH public key to reject reuse of the Nostr key. Both signatures bind the specific Nostr public key. `lib/protocol.js` can be imported by independent Node applications; Express is only one consumer.

The authentication event uses kind 22242 as an application challenge envelope. It is **not** a claim to implement NIP-42 relay authentication. The signed content must exactly match the server-issued domain, nonce, expiry and binding ID; it is accepted once. Set `PUBLIC_ORIGIN` to the application's actual origin before hosting. The demo returns proof acceptance and deliberately does not issue a login session.

## Limits and next work

- Signed NIP-09 deletion requests are now accepted as revocation evidence for the exact binding event ID. A replaced relay event does not by itself invalidate an older exported binding. Relay suppression or deletion can hide revocations; applications must query independent sources, retain evidence, and choose a short binding lifetime. Key rotation/recovery authorization is not implemented.
- Relay availability, censorship and replacement behavior vary. The UI currently queries one chosen relay; users can publish to multiple relays individually.
- P2PKH addresses and legacy compact message signatures only; multisig, hardware-wallet differences, BIP322 and token-aware address aliases require additional adapters.
- Challenge state is in memory and bounded to 1,000 pending items. Public deployment needs persistence, rate limits, origin enforcement, TLS and actual session management.
- No on-chain identity anchoring is required for this PoC. Publishing an association has privacy implications and requires an explicit click.
- The browser production bundle built and the local server started successfully. Offline cryptographic and challenge regression tests plus local HTTP smoke checks pass; live relay publication and wallet signing remain unverified.

## Primary references

- [Official Paytaca bounty](https://bchblaze.cash/bounties/)
- [Nostr NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md), [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- [bitcoinjs-message](https://github.com/bitcoinjs/bitcoinjs-message)
- [Bitcoin Cash Node verifymessage](https://docs.bitcoincashnode.org/doc/json-rpc/verifymessage/)

Original application code; third-party libraries retain their licenses. Do not claim this prototype is audited or production ready.


## Portable revocation evidence and real-key preparation

The workbench now exports `{binding, revocations}` evidence bundles; the CLI accepts both this bundle and the earlier raw event format. **Revoke this binding** asks the owning Nostr extension to sign a NIP-09 kind 5 request with an exact `e` event-ID reference. Publishing is a separate explicit action. An independent verifier rejects the binding when supplied a valid matching request by the same Nostr public key; forged or unrelated relay events cannot revoke it. A revocation bundle remains exportable even after verification rejects the binding.

Discovery queries the newest binding (NIP-01 timestamp and ID tie ordering) and then queries signed deletion requests referencing its event ID. This improves observable freshness but does not prove the absence of a withheld revocation. NIP-09 requests can cause relay deletion, so retain and share the signed evidence outside a single relay. `verifyIdentity()` reports that only supplied evidence was checked; `proofValid` never means globally current or unrevoked.

For a terminal-only public signing-message preparation step, run `node scripts/prepare.js bchtest:YOUR_PUBLIC_ADDRESS NOSTR_HEX_PUBLIC_KEY unsigned-binding.json`. It creates unsigned public fields with a one-day expiry and prints the exact BCH message. It requests no private key. In the UI, **Copy exact signing message** copies the complete message without altering line endings. The browser's built-in preparation uses a 30-day expiry; shorter-lived bindings are preferable while revocation distribution is experimental.

The challenge endpoint checks the supplied bundle at issuance. It does not consult all relays for changes during the five-minute challenge window. A relying application must refresh available evidence before authorizing sensitive actions and define its own accepted sources and freshness bounds. This remains an application protocol built on NIP-01/07/09/78, not a new registered identity standard.

## Audit verification (2026-11-19)

Run `npm test` for focused offline regressions and `npm run build` for the browser production bundle. See [criterion-by-criterion audit](../AUDIT-00-01-04.md) for exact results, limitations and participant gates. Passing these commands does not establish event eligibility or a completed chain/relay action.

`npm run smoke` temporarily starts the local service on port 4104 and checks demo generation, verification, challenge issuance, invalid-auth rejection and the page response. Stop any existing server on that port first. The child server is stopped afterward. A static `dist/` upload alone does not provide the verification/challenge API; hosting must also serve the Node service with the correct `PUBLIC_ORIGIN`.
