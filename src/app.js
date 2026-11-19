import "./style.css";
import { SimplePool } from "nostr-tools/pool";
import { verifyEvent } from "nostr-tools/pure";
const $ = (s) => document.querySelector(s);
let current;
document.querySelector("#app").innerHTML =
  `<header><b class="brand">⠿ keyweave</b><span>BCH × NOSTR</span><small>Independent keys. Shared identity.</small></header><main><section class="intro"><p class="eyebrow">IDENTITY WITHOUT A GATEKEEPER</p><h1>Your identity.<br>Your proof.<br><em>Everywhere.</em></h1><p class="lede">Bind your Bitcoin Cash address to your Nostr identity. Anyone can verify the connection, wherever you go.</p><div class="badges"><span>Self held keys</span><span>Public verification</span><span>Open protocol</span></div><aside><b>01 / Control both sides</b><p>A BCH wallet signs the binding. A separate Nostr key signs the event. Your private keys stay in your wallets.</p></aside></section><section class="workspace"><nav><b>Identity workbench</b><span class="pill">CHIPNET READY</span></nav><p class="muted">Start with an ephemeral example or bring a signed binding.</p><button id="demo">Generate a demo binding <span>↗</span></button><details><summary>Create with your wallets</summary><p>Connect a NIP-07 Nostr extension, enter your CashAddress, then sign the exact message shown in your BCH wallet.</p><label>BCH CashAddress<input id="address" placeholder="bchtest:q…"></label><button id="prepare" class="secondary">Prepare signing message</button><pre id="signmessage"></pre><label>BCH message signature<input id="signature" placeholder="Base64 compact signature"></label><button id="bind" class="secondary">Sign binding with Nostr</button></details><label>Signed binding event<textarea id="event" spellcheck="false" placeholder="Paste an event JSON to verify independently"></textarea></label><div class="actions"><button id="verify" class="secondary">Verify proof</button><button id="download" class="secondary">Export JSON ↓</button></div><div id="result" role="status">A verified identity will appear here.</div><details><summary>Publish & discover</summary><label>Relay URL<input id="relay" value="wss://relay.damus.io"></label><button id="publish" class="secondary">Publish verified binding</button><label>Nostr public key<input id="pubkey" placeholder="64 character hex public key"></label><button id="discover" class="secondary">Find binding on relay</button></details><button id="auth" class="secondary">Authenticate with Nostr extension →</button><p class="footnote">Demo keys are generated in server memory and discarded. Demo events are never published automatically.</p></section></main><footer>KEYWEAVE / BCH BLAZE 2026 <span>Two signatures. One verifiable connection.</span></footer>`;
const show = (value) =>
  ($("#result").textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2));
const api = async (path, body) => {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
};
const input = () => JSON.parse($("#event").value);
const event = () => input().binding ?? input();
const envelope = () =>
  input().binding ? input() : { binding: event(), revocations: [] };
const setEvent = (e, revocations = []) => {
  current = e;
  $("#event").value = JSON.stringify({ binding: e, revocations }, null, 2);
};
function action(id, fn) {
  $(id).onclick = async () => {
    try {
      show("Working…");
      await fn();
    } catch (e) {
      show(e.message);
    }
  };
}
action("#demo", async () => {
  setEvent(await api("demo", {}));
  show(await api("verify", envelope()));
});
action("#verify", async () => show(await api("verify", envelope())));
action("#download", async () => {
  const bundle = envelope();
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "keyweave-evidence.json";
  a.click();
  URL.revokeObjectURL(url);
  show(
    "Public binding and supplied revocation evidence exported. Run the independent verifier before relying on it.",
  );
});
let prepared;
action("#prepare", async () => {
  if (!window.nostr) throw Error("Install a NIP-07 Nostr extension to sign.");
  const issued = Math.floor(Date.now() / 1000),
    address = $("#address").value.trim();
  if (!/^(bitcoincash|bchtest):/.test(address))
    throw Error("Use a full CashAddress with prefix");
  prepared = {
    version: 1,
    network: address.split(":")[0],
    address,
    nostr: await window.nostr.getPublicKey(),
    issued,
    expires: issued + 86400 * 30,
  };
  $("#signmessage").textContent = [
    "BCH Nostr identity binding v1",
    `network:${prepared.network}`,
    `address:${prepared.address}`,
    `nostr:${prepared.nostr}`,
    `issued:${issued}`,
    `expires:${prepared.expires}`,
  ].join("\n");
  show("Sign this exact message with the BCH address above.");
});
action("#bind", async () => {
  if (!prepared) throw Error("Prepare the message first");
  setEvent(
    await window.nostr.signEvent({
      kind: 30078,
      created_at: prepared.issued,
      tags: [["d", "bch-nostr-binding:v1"]],
      content: JSON.stringify({
        ...prepared,
        bchSignature: $("#signature").value.trim(),
      }),
    }),
  );
  show(await api("verify", event()));
});
action("#publish", async () => {
  await api("verify", envelope());
  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish([$("#relay").value], event()));
    show("Relay acknowledged the binding.");
  } finally {
    pool.close([$("#relay").value]);
  }
});
action("#discover", async () => {
  if (!/^[a-f0-9]{64}$/.test($("#pubkey").value))
    throw Error("Enter a hex public key");
  const pool = new SimplePool();
  try {
    const events = await pool.querySync([$("#relay").value], {
      kinds: [30078],
      authors: [$("#pubkey").value],
      "#d": ["bch-nostr-binding:v1"],
    });
    events.sort(
      (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
    );
    if (!events.length) throw Error("No binding found");
    const revocations = await pool.querySync([$("#relay").value], {
      kinds: [5],
      authors: [$("#pubkey").value],
      "#e": [events[0].id],
    });
    setEvent(events[0], revocations);
    show(await api("verify", envelope()));
  } finally {
    pool.close([$("#relay").value]);
  }
});
action("#auth", async () => {
  if (!window.nostr)
    throw Error(
      "Authentication requires the Nostr extension that owns this binding. Demo private keys have already been discarded.",
    );
  const challenge = await api("challenge", envelope());
  if ((await window.nostr.getPublicKey()) !== event().pubkey)
    throw Error("Your extension does not own this binding");
  show(await api("authenticate", await window.nostr.signEvent(challenge)));
});

const recovery = document.createElement("details");
recovery.innerHTML =
  '<summary>Revoke this binding</summary><p>A signed NIP-09 deletion request tells verifiers to reject this event. Keep and share the evidence: relays may delete it, omit it, or be offline.</p><button id="revoke" class="secondary">Sign revocation with Nostr</button><button id="publish-revocation" class="secondary">Publish revocation evidence</button><p>Signing affects this local evidence bundle. Publishing is a separate action. Already exported bindings require fresh revocation evidence to detect this change.</p>';
$(".workspace").append(recovery);
action("#revoke", async () => {
  if (!window.nostr || (await window.nostr.getPublicKey()) !== event().pubkey)
    throw Error("Use the Nostr extension that owns this binding");
  if (
    !confirm(
      "Revoke this binding? Verifiers with this signed evidence will reject it.",
    )
  )
    return;
  const deletion = await window.nostr.signEvent({
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", event().id],
      ["k", "30078"],
    ],
    content: "Keyweave binding revoked by its Nostr key",
  });
  setEvent(event(), [...(envelope().revocations || []), deletion]);
  show(
    "Revocation signed. Export the evidence bundle and publish the request to your chosen relays.",
  );
});
action("#publish-revocation", async () => {
  const notices = envelope().revocations || [];
  if (!notices.length) throw Error("Sign a revocation first");
  for (const notice of notices)
    if (
      !verifyEvent(JSON.parse(JSON.stringify(notice))) ||
      notice.kind !== 5 ||
      notice.pubkey !== event().pubkey ||
      !notice.tags.some((t) => t[0] === "e" && t[1] === event().id)
    )
      throw Error(
        "Imported evidence is not an authorized revocation for this binding",
      );
  const pool = new SimplePool();
  try {
    await Promise.all(
      notices.map((notice) =>
        Promise.any(pool.publish([$("#relay").value], notice)),
      ),
    );
    show(
      "Relay acknowledged the signed deletion request. Export a copy; relay retention is not guaranteed.",
    );
  } finally {
    pool.close([$("#relay").value]);
  }
});
const copyMessage = document.createElement("button");
copyMessage.id = "copy-message";
copyMessage.className = "secondary";
copyMessage.textContent = "Copy exact signing message";
$("#signmessage").after(copyMessage);
action("#copy-message", async () => {
  if (!$("#signmessage").textContent) throw Error("Prepare the message first");
  await navigator.clipboard.writeText($("#signmessage").textContent);
  show(
    "Signing message copied. Sign it in your BCH wallet; never paste a seed or private key.",
  );
});
