// End-to-end API check against a running server started with AI_MOCK=true.
// Usage: node scripts/e2e.mjs http://localhost:3000
import { crc32, deflateSync } from "node:zlib";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

function check(name, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${!condition && detail !== undefined ? `  ->  ${JSON.stringify(detail)}` : ""}`);
  if (!condition) failures++;
}

/** Builds a small solid-colour PNG so uploads are real images. */
function png(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set([r, g, b], row + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A tiny HTTP client with its own cookie jar, like one browser. */
function browser() {
  const jar = { cookie: "" };
  async function call(path, { method = "GET", json, form, origin = BASE, cookie } = {}) {
    const headers = { Origin: origin };
    const sendCookie = cookie ?? jar.cookie;
    if (sendCookie) headers.Cookie = sendCookie;
    let body;
    if (json) {
      body = JSON.stringify(json);
      headers["Content-Type"] = "application/json";
    } else if (form) {
      body = form;
    }
    const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
    for (const setCookie of res.headers.getSetCookie()) {
      const [pair] = setCookie.split(";");
      const [name, value] = pair.split("=");
      jar.cookie = value ? `${name}=${value}` : "";
    }
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("application/json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return { call, jar };
}

function upload(bytes, fields = {}) {
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), "item.png");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

const unique = Date.now();
const alice = browser();
const bob = browser();
const anon = browser();

// --- auth & access control ---
check("API rejects anonymous requests", (await anon.call("/api/items")).status === 401);
const gated = await anon.call("/wardrobe");
check("pages redirect anonymous visitors to /login", [307, 308].includes(gated.status) && gated.headers.get("location")?.includes("/login"), gated.status);

check("sign-up rejects an invalid email", (await anon.call("/api/auth/signup", { method: "POST", json: { email: "nope", password: "longenough" } })).status === 400);
check("sign-up rejects a short password", (await anon.call("/api/auth/signup", { method: "POST", json: { email: `a${unique}@example.com`, password: "short" } })).status === 400);

const aliceEmail = `alice${unique}@example.com`;
const signup = await alice.call("/api/auth/signup", { method: "POST", json: { email: aliceEmail, password: "wardrobe-123" } });
check("sign-up succeeds and signs in straight away", signup.status === 201 && alice.jar.cookie.startsWith("styled_session="), signup);
check("duplicate email is refused", (await anon.call("/api/auth/signup", { method: "POST", json: { email: aliceEmail.toUpperCase(), password: "wardrobe-123" } })).status === 409);
check("wrong password is refused", (await anon.call("/api/auth/login", { method: "POST", json: { email: aliceEmail, password: "wrong-password" } })).status === 401);
const login = browser();
check("correct password signs in", (await login.call("/api/auth/login", { method: "POST", json: { email: aliceEmail, password: "wardrobe-123" } })).status === 200 && login.jar.cookie !== "");
check("cross-site POST is blocked", (await alice.call("/api/auth/logout", { method: "POST", origin: "https://evil.example" })).status === 403);

// --- wardrobe uploads (AI tags from the name in mock mode) ---
const pieces = [
  ["Blue shirt", [60, 110, 200], "top", "blue"],
  ["Pink striped trousers", [230, 150, 170], "bottom", "pink"],
  ["Green slip dress", [60, 160, 90], "dress", "green"],
  ["Tan espadrilles", [200, 170, 120], "shoes", "tan"],
  ["Beige utility jacket", [220, 205, 170], "outerwear", "beige"],
  ["Gold hoop earrings", [210, 180, 60], "accessories", "gold"],
];
const items = {};
for (const [name, rgb, category, colour] of pieces) {
  const res = await alice.call("/api/items", { method: "POST", form: upload(png(64, 80, rgb), { name, category: "auto", colour: "" }) });
  items[category] = res.data.item;
  check(`upload "${name}" is tagged ${category} / ${colour}`, res.status === 201 && res.data.item.category === category && res.data.item.colour === colour, res.data);
}
const override = await alice.call("/api/items", { method: "POST", form: upload(png(40, 40, [20, 20, 20]), { name: "Mystery piece", category: "bottom", colour: "Black" }) });
check("manual category and colour override AI", override.status === 201 && override.data.item.category === "bottom" && override.data.item.colour === "black", override.data);

const fake = new FormData();
fake.append("image", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "evil.png");
check("non-image disguised as PNG is rejected", (await alice.call("/api/items", { method: "POST", form: fake })).status === 415);
check("upload without a photo is rejected", (await alice.call("/api/items", { method: "POST", form: new FormData() })).status === 400);

const list = await alice.call("/api/items");
check("wardrobe lists all 7 pieces, newest first", list.data.items?.length === 7 && list.data.items[0].name === "Mystery piece", list.data);

// --- editing items ---
const coloursBefore = await alice.call("/api/colours");
check("known colours seed a base vocabulary", coloursBefore.data.colours?.includes("blue") && coloursBefore.data.colours?.includes("gold"), coloursBefore.data);

const edited = await alice.call(`/api/items/${items.top.id}`, {
  method: "PATCH",
  json: { name: "Vintage denim shirt", category: "top", colour: "Cerulean" },
});
check(
  "owner can edit an item's name, category and colour",
  edited.status === 200 && edited.data.item.name === "Vintage denim shirt" && edited.data.item.colour === "cerulean",
  edited.data,
);
const coloursAfter = await alice.call("/api/colours");
check("editing with a new colour adds it to the known colours", coloursAfter.data.colours?.includes("cerulean"), coloursAfter.data);

check("edit rejects an invalid category", (await alice.call(`/api/items/${items.top.id}`, { method: "PATCH", json: { name: "x", category: "made-up", colour: "blue" } })).status === 400);
check("anonymous edit is rejected", (await anon.call(`/api/items/${items.top.id}`, { method: "PATCH", json: { name: "Nope", category: "top", colour: "blue" } })).status === 401);
check("cross-site edit is blocked", (await alice.call(`/api/items/${items.top.id}`, { method: "PATCH", json: { name: "Nope", category: "top", colour: "blue" }, origin: "https://evil.example" })).status === 403);

const topBytes = png(64, 80, [60, 110, 200]);
const image = await alice.call(items.top.imageUrl);
check("owner can load their private photo", image.status === 200 && image.headers.get("content-type") === "image/png" && Buffer.compare(image.data, topBytes) === 0);
const download = await alice.call(`${items.top.imageUrl}?download=1`);
check("download sets an attachment header", download.headers.get("content-disposition")?.startsWith("attachment"));

// --- privacy between accounts ---
await bob.call("/api/auth/signup", { method: "POST", json: { email: `bob${unique}@example.com`, password: "another-123" } });
check("another user sees an empty wardrobe", (await bob.call("/api/items")).data.items?.length === 0);
check("another user can't load someone else's photo", (await bob.call(items.top.imageUrl)).status === 404);
check("another user can't delete someone else's item", (await bob.call(`/api/items/${items.top.id}`, { method: "DELETE" })).status === 404);
check("another user can't edit someone else's item", (await bob.call(`/api/items/${items.top.id}`, { method: "PATCH", json: { name: "Nope", category: "top", colour: "blue" } })).status === 404);
check("stylist needs a top+bottom or a dress", (await bob.call("/api/stylist", { method: "POST" })).status === 422);

// --- stylist ---
const styled = await alice.call("/api/stylist", { method: "POST" });
const byId = new Map(list.data.items.map((item) => [item.id, item]));
let looks = styled.data.looks ?? [];
check("stylist returns 3 looks", styled.status === 200 && looks.length === 3, styled.data);
check(
  "mock stylist accessorizes looks when accessories are available",
  looks.every((look) => look.itemIds.some((id) => byId.get(id)?.category === "accessories")),
  looks,
);
for (const look of looks) {
  const categories = look.itemIds.map((id) => byId.get(id)?.category);
  const count = (c) => categories.filter((x) => x === c).length;
  const valid =
    categories.every(Boolean) &&
    count("shoes") <= 1 &&
    count("outerwear") <= 1 &&
    ((count("dress") === 1 && count("top") === 0 && count("bottom") === 0) ||
      (count("dress") === 0 && count("top") === 1 && count("bottom") === 1));
  check(`look "${look.title}" follows the outfit rules and has a reason`, valid && look.reason.length > 10, categories);
}
const occasionRun = await alice.call("/api/stylist", { method: "POST", json: { occasion: "  Dinner   out " } });
check(
  "stylist accepts an occasion and labels the looks with it",
  occasionRun.status === 200 && occasionRun.data.looks?.length > 0 && occasionRun.data.looks.every((look) => look.occasion === "Dinner out"),
  occasionRun.data,
);
check("a malformed stylist body is rejected", (await alice.call("/api/stylist", { method: "POST", form: new FormData() })).status === 400);
const bareRun = await alice.call("/api/stylist", { method: "POST" });
looks = bareRun.data.looks ?? []; // each run replaces the saved looks, so later steps need the newest ids
check("a bare stylist request clears the occasion", looks.length > 0 && looks.every((look) => look.occasion === null));
check("looks persist for the Try-On page", (await alice.call("/api/stylist")).data.looks?.length === 3);
check("another user can't try on someone else's look", (await bob.call("/api/try-on", { method: "POST", form: (() => { const f = new FormData(); f.append("lookId", looks[0].id); f.append("photo", new Blob([topBytes]), "p.png"); return f; })() })).status === 400);

// --- try-on ---
function tryOnForm(lookId) {
  const form = new FormData();
  form.append("photo", new Blob([png(90, 120, [180, 140, 120])], { type: "image/png" }), "frame.png");
  form.append("lookId", lookId);
  form.append("aspectRatio", "3:4");
  return form;
}
const first = await alice.call("/api/try-on", { method: "POST", form: tryOnForm(looks[0].id) });
check("try-on generates an image", first.status === 201 && first.data.tryOn.saved === false && first.data.tryOn.lookTitle === looks[0].title, first.data);
check("generated image is served to its owner", (await alice.call(first.data.tryOn.imageUrl)).status === 200);
check("unsaved try-ons aren't in the saved list", (await alice.call("/api/try-on")).data.tryOns?.length === 0);
const savedRes = await alice.call(`/api/try-on/${first.data.tryOn.id}`, { method: "PATCH" });
check("save marks the try-on as saved", savedRes.status === 200 && savedRes.data.tryOn.saved === true);
check("another user can't save someone else's try-on", (await bob.call(`/api/try-on/${first.data.tryOn.id}`, { method: "PATCH" })).status === 404);

const retryOne = await alice.call("/api/try-on", { method: "POST", form: tryOnForm(looks[1].id) });
const retryTwo = await alice.call("/api/try-on", { method: "POST", form: tryOnForm(looks[1].id) });
check("retry replaces the previous unsaved result", retryTwo.status === 201 && (await alice.call(retryOne.data.tryOn.imageUrl)).status === 404);
check("saved try-on survives new generations", (await alice.call("/api/try-on")).data.tryOns?.map((t) => t.id).join() === first.data.tryOn.id);

// --- deleting pieces ---
check("owner can delete an item", (await alice.call(`/api/items/${items.outerwear.id}`, { method: "DELETE" })).status === 200);
const remaining = (await alice.call("/api/stylist")).data.looks ?? [];
check("looks using a deleted item are removed", remaining.every((look) => !look.itemIds.includes(items.outerwear.id)), remaining);
check("deleted item's photo is gone", (await alice.call(items.outerwear.imageUrl)).status === 404);
check("owner can delete a saved try-on", (await alice.call(`/api/try-on/${first.data.tryOn.id}`, { method: "DELETE" })).status === 200 && (await alice.call("/api/try-on")).data.tryOns.length === 0);

// --- pages & sign out ---
for (const page of ["/wardrobe", "/stylist", "/try-on"]) {
  const res = await alice.call(page);
  check(`page ${page} renders for a signed-in user`, res.status === 200 && res.data.toString().includes("ATELIER"), res.status);
}
const loginPage = await alice.call("/login");
check("signed-in users skip the login page", [307, 308].includes(loginPage.status) && loginPage.headers.get("location")?.includes("/wardrobe"));

const oldCookie = alice.jar.cookie;
check("sign out succeeds", (await alice.call("/api/auth/logout", { method: "POST" })).status === 200 && alice.jar.cookie === "");
check("the old session token no longer works", (await alice.call("/api/items", { cookie: oldCookie })).status === 401);

console.log(`\n${failures === 0 ? "All end-to-end checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
