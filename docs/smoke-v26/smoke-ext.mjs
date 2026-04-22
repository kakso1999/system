// v2.6 docx-compliance extended smoke — tests endpoints called out in spec supplement
import puppeteer from "puppeteer";
import fs from "fs";

const OUT = "E:/工作代码/159_system/docs/smoke-v26";
const BASE = "http://localhost:3000";
const API = "http://localhost:8000";
const ADMIN = { u: "admin", p: "admin123" };

const results = [];
const consoleErrs = [];
const log = (...a) => console.log("[smoke2]", ...a);
function record(name, ok, extra = {}) { results.push({ name, ok, ...extra }); log(ok ? "✅" : "❌", name, extra); }

async function loginAdmin() {
  const r = await fetch(`${API}/api/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN.u, password: ADMIN.p }),
  });
  const j = await r.json();
  return j.access_token;
}

async function apiGet(path, token) {
  const r = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: await r.text() };
}
async function apiPost(path, body, token, headers = {}) {
  const r = await fetch(`${API}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.text() };
}

(async () => {
  const token = await loginAdmin();
  log("admin token ok");

  // --- §G /_version ---
  const v = await apiGet("/_version");
  record("§H /_version returns 200", v.status === 200, { status: v.status, body: v.body.slice(0, 100) });

  // --- §A sponsors admin list ---
  const sp = await apiGet("/api/admin/sponsors/", token);
  record("§A sponsors admin list", sp.status === 200, { status: sp.status });

  // --- §A sponsors public ---
  const spp = await apiGet("/api/sponsors/active");
  record("§A sponsors public /active", spp.status === 200, { status: spp.status });

  // --- §A registrations pending ---
  const reg = await apiGet("/api/admin/registrations/", token);
  const regCount = await apiGet("/api/admin/registrations/pending-count", token);
  record("§A registrations list + pending-count", reg.status === 200 && regCount.status === 200, { list: reg.status, count: regCount.status });

  // --- §A rewards overview (dashboard) ---
  const ro = await apiGet("/api/admin/dashboard/reward-overview", token);
  record("§A rewards-overview dashboard", ro.status === 200, { status: ro.status });

  // --- §A bonus rules + records ---
  const br = await apiGet("/api/admin/bonus/rules", token);
  const bs = await apiGet("/api/admin/bonus/records", token);
  const bts = await apiGet("/api/admin/bonus/settlements", token);
  record("§E admin bonus rules/records/settlements", br.status === 200 && bs.status === 200 && bts.status === 200,
    { rules: br.status, records: bs.status, settlements: bts.status });

  // --- §A promotion activity logs ---
  const pa = await apiGet("/api/admin/promotion-activity/", token).catch(() => ({ status: "err" }));
  record("§A promotion activity logs", [200].includes(pa.status), { status: pa.status });

  // --- §D external redeem (needs X-API-Key header) ---
  const keyRes = await apiGet("/api/admin/settings/", token);
  let apiKey = "";
  try { const arr = JSON.parse(keyRes.body); const row = arr.find?.((r) => r.key === "redeem_api_key"); apiKey = row?.value || ""; } catch {}
  const redeem1 = await apiPost("/api/redeem/verify", { code: "BOGUS123" }, null, apiKey ? { "X-API-Key": apiKey } : {});
  record("§D /api/redeem/verify responds (any code != 500)", redeem1.status !== 500, { status: redeem1.status, hasKey: !!apiKey, body: redeem1.body.slice(0, 120) });

  const redeem2 = await apiPost("/api/redeem/claim", { code: "BOGUS123" }, null, apiKey ? { "X-API-Key": apiKey } : {});
  record("§D /api/redeem/claim responds", redeem2.status !== 500, { status: redeem2.status, body: redeem2.body.slice(0, 120) });

  // --- §C PIN verify endpoint sanity (expect 200/422 but not 500) ---
  const pin = await apiPost("/api/claim/pin/verify", { staff_code: "BOGUS", pin: "000", device_fingerprint: "x", token_signature: "y" }, null);
  record("§C /api/claim/pin/verify responds", pin.status !== 500, { status: pin.status });

  // --- §B promoter live-qr generate (needs staff token; just confirm 401 not 500) ---
  const lqr = await apiPost("/api/promoter/live-qr/generate", {}, null);
  record("§B /api/promoter/live-qr/generate auth-gated (401 not 500)", lqr.status === 401, { status: lqr.status });

  // --- §B promoter bonus today (auth-gated) ---
  const bt = await apiGet("/api/promoter/bonus/today");
  record("§B /api/promoter/bonus/today auth-gated", bt.status === 401, { status: bt.status });

  // --- §A admins page API ---
  const admins = await apiGet("/api/admin/admins/", token);
  record("§A admins CRUD list", admins.status === 200, { status: admins.status });

  // --- §C mock-redeem frontend page ---
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrs.push({ url: page.url(), text: m.text() }));
  page.on("pageerror", (e) => consoleErrs.push({ url: page.url(), text: String(e) }));

  await page.goto(`${BASE}/mock-redeem`, { waitUntil: "networkidle2" });
  await page.screenshot({ path: `${OUT}/ext-01-mock-redeem.png`, fullPage: true });
  const mrText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  record("§C /mock-redeem page renders", !/404/.test(mrText) && mrText.length > 5, { snippet: mrText.slice(0, 80) });

  // --- Login to cookie, then navigate admin pages ---
  await page.goto(`${BASE}/admin-login`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#username", { timeout: 10000 });
  const setReact = (sel, val) => page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel, val);
  await setReact("#username", ADMIN.u);
  await setReact('input[type="password"]', ADMIN.p);
  await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null)]);

  const adminPages = [
    ["admins", "§A admin accounts page"],
    ["sponsors", "§A sponsors page"],
    ["registrations", "§A staff-registration review page"],
    ["settings", "§G system settings page"],
    ["rewards-overview", "§A rewards-overview UI"],
    ["promotion-activity", "§A promotion-activity UI"],
    ["claims", "§E claims records"],
    ["finance", "§A finance combined-settle"],
  ];
  for (const [path, name] of adminPages) {
    await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle2" });
    const url = page.url();
    const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
    const ok = url.endsWith(`/${path}`) && !/管理员后台登录|404/.test(text);
    await page.screenshot({ path: `${OUT}/ext-${path}.png`, fullPage: true });
    record(name, ok, { url, snippet: text.slice(0, 80) });
  }

  // --- §B staff register page ---
  await page.goto(`${BASE}/staff-register`, { waitUntil: "networkidle2" });
  const srText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  record("§B staff-register page", /name|账号|注册|Register/i.test(srText), { snippet: srText.slice(0, 100) });

  // --- §C PIN page route (live_qr_enabled) ---
  await page.goto(`${BASE}/pin/BOGUS_CODE`, { waitUntil: "networkidle2" }).catch(() => {});
  const pinText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  record("§C /pin/<code> page renders (any state)", pinText.length > 0, { snippet: pinText.slice(0, 80) });

  await browser.close();

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results, consoleErrs: consoleErrs.slice(0, 30),
  };
  fs.writeFileSync(`${OUT}/results-ext.json`, JSON.stringify(summary, null, 2));
  log(`\nSUMMARY ${summary.passed}/${summary.total} passed, console errs: ${consoleErrs.length}`);
})();
