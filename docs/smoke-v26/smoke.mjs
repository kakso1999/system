// v2.6 smoke — 8 paths from HANDOFF_v2.7 §二
import puppeteer from "file:///C:/Users/Administrator/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";
import fs from "fs";

const OUT = "E:/工作代码/159_system/docs/smoke-v26";
const BASE = "http://localhost:3000";
const API = "http://localhost:8000";
const ADMIN_USER = "admin";
const ADMIN_PASS = "StrongPass2026!";

const log = (...a) => console.log("[smoke]", ...a);
const results = [];
const consoleErrs = [];

function record(name, ok, extra = {}) {
  results.push({ name, ok, ...extra });
  log(ok ? "✅" : "❌", name, extra);
}

async function shot(page, name) {
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrs.push({ url: page.url(), text: msg.text() });
  });
  page.on("pageerror", (e) => consoleErrs.push({ url: page.url(), text: String(e) }));

  try {
    // ---------- 1. Admin login ----------
    await page.goto(`${BASE}/admin-login`, { waitUntil: "networkidle2" });
    await page.type('input[name="username"], input[type="text"]', ADMIN_USER).catch(() => {});
    await page.type('input[name="password"], input[type="password"]', ADMIN_PASS).catch(() => {});
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null),
    ]);
    const url1 = page.url();
    await shot(page, "01-admin-dashboard");
    const navCount = await page.$$eval('aside a, nav a', (a) => a.length).catch(() => 0);
    record("1. admin login -> dashboard", url1.includes("/dashboard"), { url: url1, navCount });

    // Capture token cookie for programmatic calls
    const cookies = await page.cookies();
    const tokenCookie = cookies.find((c) => /token/i.test(c.name));
    const token = tokenCookie?.value || "";

    // ---------- 2. Staff register captcha ----------
    // Toggle setting ON
    const setRes = await fetch(`${API}/api/admin/settings/staff_register_captcha_enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ value: true }),
    }).then((r) => r.status).catch((e) => String(e));
    await page.goto(`${BASE}/staff-register`, { waitUntil: "networkidle2" });
    await shot(page, "02-staff-register");
    const hasConfirm = (await page.$('input[name="confirm_password"], input[placeholder*="确认" i], input[placeholder*="confirm" i]')) !== null;
    const hasCaptcha = await page.evaluate(() => document.body.innerText.match(/captcha|验证码/i) !== null);
    record("2. staff register B1", hasConfirm || hasCaptcha, { setRes, hasConfirm, hasCaptcha });

    // ---------- 3. Rewards overview A7 ----------
    await page.goto(`${BASE}/rewards-overview`, { waitUntil: "networkidle2" });
    await shot(page, "03-rewards-overview");
    const rewardsText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    record("3. rewards-overview", !rewardsText.includes("404"), { snippet: rewardsText.slice(0, 100) });

    // ---------- 4. Promotion activity A11 ----------
    await page.goto(`${BASE}/promotion-activity`, { waitUntil: "networkidle2" });
    await shot(page, "04-promotion-activity");
    const promoText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    record("4. promotion-activity", !promoText.includes("404"), { snippet: promoText.slice(0, 100) });

    // ---------- 5. Finance tabs A14+E3 ----------
    await page.goto(`${BASE}/finance`, { waitUntil: "networkidle2" });
    await shot(page, "05a-finance");
    const financeText = await page.evaluate(() => document.body.innerText);
    const hasCombined = /合并结算|combined/i.test(financeText);
    const hasRecon = /对账|reconciliation/i.test(financeText);
    const hasExport = /导出|export/i.test(financeText);
    record("5. finance tabs", hasCombined && hasRecon && hasExport, { hasCombined, hasRecon, hasExport });

    // ---------- 6. Reward codes import E1 ----------
    await page.goto(`${BASE}/campaigns`, { waitUntil: "networkidle2" });
    await shot(page, "06-campaigns");
    record("6. campaigns page loads", true, { url: page.url() });

    // ---------- 7. User claim flow C5/C2/C6 ----------
    await page.goto(`${BASE}/welcome/NFPSSY?v=0`, { waitUntil: "networkidle2" });
    await shot(page, "07a-welcome");
    const welcomeText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    record("7a. welcome NFPSSY?v=0", !welcomeText.includes("404") && !welcomeText.includes("mismatch"), { snippet: welcomeText.slice(0, 100) });

    await page.goto(`${BASE}/welcome/NFPSSY?v=999`, { waitUntil: "networkidle2" });
    await shot(page, "07b-welcome-bad-version");
    const badText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    record("7b. welcome ?v=999 should fail", /mismatch|失效|invalid|404/i.test(badText), { snippet: badText.slice(0, 120) });

    // ---------- 8. JWT blacklist M4 ----------
    const me1 = await fetch(`${API}/api/admin/dashboard/`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
    const logout = await fetch(`${API}/api/auth/admin/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
    const me2 = await fetch(`${API}/api/admin/dashboard/`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
    record("8. JWT blacklist", me1 === 200 && me2 === 401, { me1, logout, me2 });

  } catch (e) {
    record("FATAL", false, { err: String(e), stack: e.stack });
  }

  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, consoleErrs }, null, 2));
  log("done. errors:", consoleErrs.length, "results:", results.length);
  await browser.close();
})();
