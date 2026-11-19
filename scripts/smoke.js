import { spawn } from "node:child_process";
import { once } from "node:events";

const child = spawn(process.execPath, ["server.js"], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (data) => { output += data; });
child.stderr.on("data", (data) => { output += data; });
try {
  for (let i = 0; i < 100 && !output.includes("Keyweave:"); i++) {
    if (child.exitCode !== null) throw Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!output.includes("Keyweave:")) throw Error("Server did not become ready");
  const call = async (path, body) => {
    const response = await fetch("http://127.0.0.1:4104/api/" + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const demo = await call("demo", {});
  if (demo.status !== 200) throw Error("Demo route failed");
  const verified = await call("verify", demo.body);
  if (!verified.body.proofValid) throw Error("Verification route failed");
  const challenge = await call("challenge", demo.body);
  if (challenge.status !== 200 || challenge.body.kind !== 22242) throw Error("Challenge route failed");
  const invalid = await call("authenticate", {});
  if (invalid.status !== 400) throw Error("Invalid authentication must fail");
  if ((await fetch("http://127.0.0.1:4104/")).status !== 200) throw Error("Page failed");
  console.log("PASS local HTTP smoke: demo, verify, challenge, invalid-auth rejection, page. No relay publication or transaction.");
} finally {
  if (child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill();
    await ended;
  }
}
