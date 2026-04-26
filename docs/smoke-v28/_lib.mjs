// Shared utilities for v2.8 e2e scripts.
import puppeteer from "file:///C:/Users/Administrator/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

export const OUT = "E:/工作代码/159_system/docs/smoke-v28";
export const BASE = "http://localhost:3000";
export const API = "http://localhost:8000";
export const ADMIN_USER = "admin";
export const ADMIN_PASS = "admin123";

// Run a python snippet against ground_rewards MongoDB.
// snippet should produce stdout (preferably JSON).
export function mongoPy(snippet) {
  const code = `
from pymongo import MongoClient
from bson import ObjectId
import json, sys
c = MongoClient('mongodb://localhost:27017')
db = c.ground_rewards
${snippet}
`;
  const out = execFileSync("python", ["-c", code], { encoding: "utf-8", timeout: 15000 });
  return out.trim();
}

export function mongoJson(snippet) {
  const raw = mongoPy(snippet);
  try { return JSON.parse(raw); } catch { return raw; }
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

export async function launchBrowser({ headless = "new", viewport = { width: 1440, height: 900 } } = {}) {
  const browser = await puppeteer.launch({ headless, defaultViewport: viewport, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push({ url: page.url(), text: m.text() }); });
  page.on("pageerror", (e) => logs.push({ url: page.url(), text: String(e) }));
  return { browser, page, logs };
}

// Set value on a React-controlled input and dispatch input event.
export async function setReact(page, selector, value) {
  await page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("selector not found: " + sel);
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
}

export async function shot(page, name, flow = "") {
  const dir = flow ? path.join(OUT, flow) : OUT;
  ensureDir(dir);
  const p = path.join(dir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

export async function saveFail(page, flow, step) {
  const dir = path.join(OUT, flow);
  ensureDir(dir);
  try { await page.screenshot({ path: path.join(dir, `FAIL-${step}.png`), fullPage: true }); } catch {}
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(dir, `FAIL-${step}.html`), html);
  } catch {}
}

export async function adminLogin(page, { username = ADMIN_USER, password = ADMIN_PASS } = {}) {
  await page.goto(`${BASE}/admin-login`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await setReact(page, '#username', username);
  await setReact(page, '#password', password);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => null),
  ]);
  const cookies = await page.cookies();
  const tc = cookies.find((c) => /token/i.test(c.name));
  return { url: page.url(), token: tc?.value || "" };
}

export async function staffLogin(page, username, password) {
  await page.goto(`${BASE}/staff-login`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await setReact(page, '#username', username);
  await setReact(page, '#password', password);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => null),
  ]);
  return { url: page.url() };
}

export async function apiAdminLogin() {
  const r = await fetch(`${API}/api/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const j = await r.json();
  return j.access_token;
}

export async function apiStaffLogin(username, password) {
  const r = await fetch(`${API}/api/auth/staff/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await r.json()).access_token;
}

export async function setSetting(token, key, value) {
  return await fetch(`${API}/api/admin/settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  }).then((r) => r.status);
}

export function record(results, name, ok, extra = {}) {
  results.push({ name, ok, ...extra });
  console.log(ok ? "✅" : "❌", name, JSON.stringify(extra).slice(0, 200));
}

export function writeResults(flow, results, meta = {}) {
  const dir = path.join(OUT, flow);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ flow, meta, results, pass: results.filter(r => r.ok).length, fail: results.filter(r => !r.ok).length }, null, 2));
}

export async function cleanupTestData() {
  mongoPy(`
db.staff_users.delete_many({'username': {'$regex': '^test_'}})
db.admins.delete_many({'username': {'$regex': '^test_'}})
db.sponsors.delete_many({'name': {'$regex': '^test_'}})
db.campaigns.delete_many({'name': {'$regex': '^test_'}})
db.claims.delete_many({'phone': {'$regex': '^\\\\+639000'}})
try:
  db.staff_registrations.delete_many({'username': {'$regex': '^test_'}})
except: pass
print('ok')
`);
}
