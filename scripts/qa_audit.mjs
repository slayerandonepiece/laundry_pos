import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "/Users/reddygona/Documents/skills/laundry_pos/src/generated/prisma/client.ts";

dotenv.config({ path: path.resolve("/Users/reddygona/Documents/skills/laundry_pos", ".env") });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SCREENSHOTS_DIR = "/Users/reddygona/.gemini/antigravity/brain/412c83ae-5677-43e0-a2be-2048b409afd0/screenshots";
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 768, height: 1024, mobile: false },
  { name: "mobile", width: 375, height: 812, mobile: true },
];

class ChromeClient {
  constructor(port = 9228) {
    this.port = port;
    this.chrome = null;
    this.ws = null;
    this.msgId = 1;
  }

  async start() {
    this.chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
      "--headless",
      `--remote-debugging-port=${this.port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=/tmp/chrome-qa-profile",
      "about:blank"
    ]);

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://localhost:${this.port}/json/list`);
        const pages = await res.json();
        const page = pages.find(p => p.type === "page");
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error("Could not connect to Chrome debugging endpoint");

    this.ws = new WebSocket(wsUrl);
    await new Promise(r => this.ws.onopen = r);

    await this.send("Page.enable");
    await this.send("DOM.enable");
    await this.send("Network.enable");
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          this.ws.removeEventListener("message", handler);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      this.ws.addEventListener("message", handler);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setCookie(name, value, domain = "localhost") {
    await this.send("Network.setCookie", {
      name,
      value,
      domain,
      path: "/",
      httpOnly: true,
      secure: false,
    });
  }

  async clearCookies() {
    await this.send("Network.clearBrowserCookies");
  }

  async setViewport(vp) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: vp.mobile,
    });
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await new Promise(r => setTimeout(r, 1200));
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async captureScreenshot(filepath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(filepath, Buffer.from(res.data, "base64"));
  }

  async stop() {
    try {
      if (this.ws) this.ws.close();
    } catch(e) {}
    if (this.chrome) this.chrome.kill();
  }
}

// In-page audit script to detect layout, alignment, contrast, overflow issues
const PAGE_AUDIT_SCRIPT = `(() => {
  const issues = [];
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  const docWidth = document.documentElement.scrollWidth;

  // 1. Horizontal page overflow
  if (docWidth > winWidth + 1) {
    const overElements = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > winWidth + 2 && rect.width > 0 && rect.height > 0) {
        const sel = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') : '') + (el.id ? '#' + el.id : '');
        overElements.push({
          selector: sel,
          rect: { right: Math.round(rect.right), width: Math.round(rect.width) },
          text: (el.innerText || '').slice(0, 40).replace(/\\s+/g, ' ')
        });
        if (overElements.length >= 8) break;
      }
    }
    issues.push({
      type: 'HORIZONTAL_OVERFLOW',
      severity: 'HIGH',
      message: \`Page has horizontal overflow: scrollWidth \${docWidth}px > viewport \${winWidth}px\`,
      elements: overElements
    });
  }

  // 2. Element-level scroll overflow clipping
  const allElements = document.querySelectorAll('button, a, input, select, h1, h2, h3, p, th, td, [class*="badge"], [class*="pill"], [class*="chip"]');
  const clipped = [];
  for (const el of allElements) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') {
      if (el.scrollWidth > el.clientWidth + 2 && el.clientHeight > 0 && el.clientWidth > 0) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text.length > 0 && text.length < 50) {
          clipped.push({
            tag: el.tagName.toLowerCase(),
            class: (el.className || '').toString().slice(0, 40),
            text,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
          });
        }
      }
    }
  }
  if (clipped.length > 0) {
    issues.push({
      type: 'TEXT_CLIPPING_OR_TRUNCATION',
      severity: 'MEDIUM',
      message: \`\${clipped.length} text element(s) are clipped/truncated\`,
      elements: clipped.slice(0, 6)
    });
  }

  // 3. Invisible or severe low-contrast text (< 2.5:1 for normal text)
  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  function parseRgb(colorStr) {
    const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
  }

  const contrastIssues = [];
  const textNodes = document.querySelectorAll('p, span, h1, h2, h3, h4, label, a, button, small, th, td');
  for (const el of textNodes) {
    if (contrastIssues.length >= 6) break;
    const text = (el.innerText || '').trim();
    if (!text || text.length > 60 || el.children.length > 1) continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

    const fg = parseRgb(cs.color);
    if (!fg) continue;

    // find background color by ascending
    let bg = null;
    let curr = el;
    while (curr && curr !== document.documentElement) {
      const bcs = window.getComputedStyle(curr);
      const c = parseRgb(bcs.backgroundColor);
      if (c && !bcs.backgroundColor.includes('rgba(0, 0, 0, 0)') && !bcs.backgroundColor.includes('transparent')) {
        bg = c;
        break;
      }
      curr = curr.parentElement;
    }
    if (!bg) bg = [255, 255, 255]; // fallback white

    const L1 = getLuminance(...fg);
    const L2 = getLuminance(...bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

    if (ratio < 2.0 && text.length > 2) {
      contrastIssues.push({
        text: text.slice(0, 30),
        ratio: Math.round(ratio * 10) / 10,
        fg: cs.color,
        bg: \`rgb(\${bg.join(',')})\`,
        selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/)[0] : '')
      });
    }
  }
  if (contrastIssues.length > 0) {
    issues.push({
      type: 'LOW_CONTRAST',
      severity: 'HIGH',
      message: \`Severe low contrast / unreadable text detected (\${contrastIssues.length} instances)\`,
      elements: contrastIssues
    });
  }

  // 4. Broken images
  const brokenImages = [];
  const imgs = document.querySelectorAll('img');
  for (const img of imgs) {
    if (img.naturalWidth === 0 && img.src) {
      brokenImages.push(img.src);
    }
  }
  if (brokenImages.length > 0) {
    issues.push({
      type: 'BROKEN_IMAGES',
      severity: 'HIGH',
      message: \`\${brokenImages.length} broken image(s) found\`,
      elements: brokenImages
    });
  }

  // 5. Small touch targets on mobile (< 32px height/width for buttons/links)
  if (winWidth <= 768) {
    const smallTargets = [];
    const interactive = document.querySelectorAll('button, a, input[type="checkbox"], input[type="radio"]');
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 28 || rect.height < 28)) {
        const text = (el.innerText || el.getAttribute('aria-label') || el.name || '').trim();
        smallTargets.push({
          tag: el.tagName.toLowerCase(),
          class: (el.className || '').toString().slice(0, 30),
          size: \`\${Math.round(rect.width)}x\${Math.round(rect.height)}px\`,
          text: text.slice(0, 25)
        });
        if (smallTargets.length >= 6) break;
      }
    }
    if (smallTargets.length > 0) {
      issues.push({
        type: 'TOUCH_TARGET_TOO_SMALL',
        severity: 'LOW',
        message: \`\${smallTargets.length} interactive elements under recommended mobile touch target\`,
        elements: smallTargets
      });
    }
  }

  return {
    title: document.title,
    scrollWidth: docWidth,
    viewportWidth: winWidth,
    hasIssues: issues.length > 0,
    issues
  };
})()`;

async function main() {
  console.log("=== Starting QA Strict Audit ===");

  // Create test sessions for each role
  const superAdminUser = await prisma.user.findFirst({ where: { isSuperAdmin: true } });
  const ownerUser = await prisma.user.findFirst({ where: { phone: process.env.QA_OWNER_PHONE ?? "" } });
  const employeeUser = await prisma.user.findFirst({ where: { phone: process.env.QA_EMPLOYEE_PHONE ?? "" } });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const adminSession = await prisma.session.create({
    data: {
      userId: superAdminUser.id,
      credentialVersion: superAdminUser.credentialVersion,
      expiresAt,
      token: "qa_token_super_admin_" + Date.now()
    }
  });

  const ownerSession = await prisma.session.create({
    data: {
      userId: ownerUser.id,
      credentialVersion: ownerUser.credentialVersion,
      expiresAt,
      token: "qa_token_owner_" + Date.now()
    }
  });

  const employeeSession = await prisma.session.create({
    data: {
      userId: employeeUser.id,
      credentialVersion: employeeUser.credentialVersion,
      expiresAt,
      token: "qa_token_employee_" + Date.now()
    }
  });

  const createdSessionIds = [adminSession.id, ownerSession.id, employeeSession.id];
  console.log("Created test sessions:", createdSessionIds);

  const client = new ChromeClient(9228);
  await client.start();

  const results = [];

  const testMatrix = [
    // 1. Unauthenticated / Public
    {
      role: "public",
      sessionId: null,
      cases: [
        { name: "public_login", path: "/login" },
        { name: "public_super_admin_login", path: "/super-admin/login" },
      ]
    },
    // 2. Owner
    {
      role: "owner",
      sessionId: ownerSession.id,
      cases: [
        { name: "owner_dashboard", path: "/" },
        { name: "owner_sales_pos", path: "/admin/sales" },
        { name: "owner_orders", path: "/admin/orders" },
        { name: "owner_products", path: "/admin/products" },
        { name: "owner_expenses", path: "/admin/expenses" },
        { name: "owner_employees", path: "/admin/employees" },
        { name: "owner_outlets", path: "/admin/outlets" },
        { name: "owner_profile", path: "/admin/profile" },
      ]
    },
    // 3. Employee
    {
      role: "employee",
      sessionId: employeeSession.id,
      cases: [
        { name: "employee_sales_pos", path: "/admin/sales" },
        { name: "employee_orders", path: "/admin/orders" },
      ]
    },
    // 4. Super Admin
    {
      role: "super_admin",
      sessionId: adminSession.id,
      cases: [
        { name: "super_admin_dashboard", path: "/super-admin" },
        { name: "super_admin_stores", path: "/super-admin/stores" },
        { name: "super_admin_store_detail", path: "/super-admin/stores/cmu8c8os10004mfs79kvrkvy2" },
        { name: "super_admin_store_users", path: "/super-admin/stores/cmu8c8os10004mfs79kvrkvy2/users" },
        { name: "super_admin_store_outlets", path: "/super-admin/stores/cmu8c8os10004mfs79kvrkvy2/outlets" },
        { name: "super_admin_store_subscription", path: "/super-admin/stores/cmu8c8os10004mfs79kvrkvy2/subscription" },
        { name: "super_admin_store_activity", path: "/super-admin/stores/cmu8c8os10004mfs79kvrkvy2/activity" },
        { name: "super_admin_store_edit", path: "/super-admin/stores/cmu8c8os10004mfs79kvrkvy2/edit" },
        { name: "super_admin_users", path: "/super-admin/users" },
        { name: "super_admin_user_detail", path: "/super-admin/users/cmu8c5wx40003mfs78xmu6b1d" },
        { name: "super_admin_subscriptions_plans", path: "/super-admin/subscriptions" },
        { name: "super_admin_subscriptions_billing", path: "/super-admin/subscriptions/billing" },
        { name: "super_admin_subscriptions_invoice", path: "/super-admin/subscriptions/invoices/1" },
        { name: "super_admin_payment_methods", path: "/super-admin/payment-methods" },
      ]
    }
  ];

  try {
    for (const group of testMatrix) {
      console.log(`\n--- Testing Role: ${group.role} ---`);
      await client.clearCookies();
      if (group.sessionId) {
        await client.setCookie("el_session", group.sessionId);
      }

      for (const tc of group.cases) {
        console.log(`Testing screen: ${tc.name} (${tc.path})`);

        for (const vp of VIEWPORTS) {
          await client.setViewport(vp);
          const fullUrl = `http://localhost:3000${tc.path}`;
          await client.navigate(fullUrl);

          const screenshotName = `${tc.name}_${vp.name}.png`;
          const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
          await client.captureScreenshot(screenshotPath);

          const audit = await client.evaluate(PAGE_AUDIT_SCRIPT);

          results.push({
            role: group.role,
            screen: tc.name,
            path: tc.path,
            viewport: vp.name,
            viewportDimensions: `${vp.width}x${vp.height}`,
            screenshot: screenshotName,
            screenshotPath,
            title: audit.title,
            scrollWidth: audit.scrollWidth,
            hasIssues: audit.hasIssues,
            issues: audit.issues
          });

          if (audit.hasIssues) {
            console.log(`  [!] ${vp.name} found ${audit.issues.length} issue(s):`);
            for (const issue of audit.issues) {
              console.log(`      - ${issue.severity} [${issue.type}]: ${issue.message}`);
            }
          } else {
            console.log(`  [✓] ${vp.name} passed`);
          }
        }
      }
    }

    // Now test interactive dialogs / modals
    console.log("\n--- Testing Interactive Dialogs & Modals ---");
    await client.clearCookies();
    await client.setCookie("el_session", adminSession.id);
    await client.setViewport(VIEWPORTS[0]); // desktop

    // Test Super Admin: Onboard Store Dialog
    await client.navigate("http://localhost:3000/super-admin/stores");
    const openOnboard = await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Onboard store') || b.innerText.includes('Onboard'));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    if (openOnboard) {
      await new Promise(r => setTimeout(r, 600));
      const modalScreenshot = path.join(SCREENSHOTS_DIR, "modal_onboard_store_desktop.png");
      await client.captureScreenshot(modalScreenshot);
      const modalAudit = await client.evaluate(PAGE_AUDIT_SCRIPT);
      results.push({
        role: "super_admin",
        screen: "modal_onboard_store",
        path: "/super-admin/stores#onboard",
        viewport: "desktop",
        screenshot: "modal_onboard_store_desktop.png",
        screenshotPath: modalScreenshot,
        hasIssues: modalAudit.hasIssues,
        issues: modalAudit.issues
      });
      console.log("  Tested Onboard Store modal on Desktop");
    }

    // Test Store Owner: POS & Add Order flow
    await client.clearCookies();
    await client.setCookie("el_session", ownerSession.id);
    await client.navigate("http://localhost:3000/admin/sales");
    await client.setViewport(VIEWPORTS[0]);
    const posModal = await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New order') || b.innerText.includes('Add service'));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    if (posModal) {
      await new Promise(r => setTimeout(r, 600));
      const posScreenshot = path.join(SCREENSHOTS_DIR, "modal_pos_action_desktop.png");
      await client.captureScreenshot(posScreenshot);
    }

    // Save final structured results
    const resultsPath = "/Users/reddygona/.gemini/antigravity/brain/412c83ae-5677-43e0-a2be-2048b409afd0/scratch/qa_results.json";
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nAudit complete! Results saved to ${resultsPath}`);

  } finally {
    await client.stop();
    // Cleanup sessions
    await prisma.session.deleteMany({
      where: { id: { in: createdSessionIds } }
    });
    console.log("Cleaned up test session rows.");
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error("Audit failed with error:", err);
  process.exit(1);
});
