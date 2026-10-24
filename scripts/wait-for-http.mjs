const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/wait-for-http.mjs <url>');
const deadline = Date.now() + 60_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) { ready = true; break; }
  } catch { /* The server may still be starting. */ }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) throw new Error(`Server did not become ready: ${url}`);
console.log(`Server ready: ${url}`);
