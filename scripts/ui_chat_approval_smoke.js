// Chat approval UI smoke test (Playwright)
// Usage: node scripts/ui_chat_approval_smoke.js
const UI_BASE = process.env.UI_BASE_URL || "http://127.0.0.1:3000";
const timeoutMs = Number(process.env.UI_SMOKE_TIMEOUT_MS || 45000);

function jsonResponse(payload) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload)
  };
}

async function run() {
  let chromium;
  try {
    ({ chromium } = require("@playwright/test"));
  } catch (err) {
    console.error("Playwright is not installed. Run: npm install");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.on("request", req => {
    const url = req.url();
    if (url.includes("/chat") || url.includes("/api/approvals")) {
      console.log(`[req] ${req.method()} ${url}`);
    }
  });

  let approvalCounter = 0;
  const approvals = new Map();

  function createApproval() {
    approvalCounter += 1;
    const id = `apr-ui-smoke-${approvalCounter}`;
    const approval = {
      id,
      toolName: "action.run",
      humanSummary: "Approval required for smoke validation",
      status: "pending",
      token: `token-${approvalCounter}`,
      approvalContext: {
        action: "Open target page and extract body text",
        why: "Control request invokes external browser automation requiring approval.",
        tool: "action.run",
        boundary: "host -> external web automation lane",
        risk: "approval_required",
        rollback: "Deny to prevent execution. If executed, stop run and remove captured artifacts."
      }
    };
    approvals.set(id, approval);
    return approval;
  }

  await page.route("**/api/auth/me", async route => {
    await route.fulfill(jsonResponse({
      authRequired: false,
      authenticated: true,
      user: {
        id: "ui-smoke-user",
        name: "UI Smoke",
        email: "ui-smoke@example.com"
      }
    }));
  });

  await page.route("**/chat", async route => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const approval = createApproval();
    console.log(`[mock] /chat -> approval ${approval.id}`);
    await route.fulfill(jsonResponse({
      text: "Approval smoke response ready.",
      behavior: { emotion: "neutral", intensity: 0.4 },
      approval,
      aika: {
        protocol: {
          intent: "CONTROL",
          lane: { system: "agent-browser", lane: "deterministic_web" },
          risk: { level: "approval_required" }
        },
        laneResult: {
          tool: "action.run",
          evidence: `run=run-ui-smoke-${approvalCounter}`
        },
        moduleResult: {
          run: { id: `module-run-ui-smoke-${approvalCounter}` }
        }
      }
    }));
  });

  await page.route("**/api/approvals", async route => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill(jsonResponse({ approvals: Array.from(approvals.values()) }));
  });

  await page.route("**/api/approvals/*/approve", async route => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const id = route.request().url().split("/").slice(-2, -1)[0];
    const current = approvals.get(id);
    if (!current) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "approval_not_found" })
      });
      return;
    }
    const next = { ...current, status: "approved" };
    approvals.set(id, next);
    console.log(`[mock] approve ${id}`);
    await route.fulfill(jsonResponse({ approval: next }));
  });

  await page.route("**/api/approvals/*/deny", async route => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const id = route.request().url().split("/").slice(-2, -1)[0];
    const current = approvals.get(id);
    if (!current) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "approval_not_found" })
      });
      return;
    }
    const next = { ...current, status: "denied" };
    approvals.set(id, next);
    console.log(`[mock] deny ${id}`);
    await route.fulfill(jsonResponse({ approval: next }));
  });

  await page.route("**/api/approvals/*/execute", async route => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const id = route.request().url().split("/").slice(-2, -1)[0];
    const current = approvals.get(id);
    if (!current) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "approval_not_found" })
      });
      return;
    }
    const next = { ...current, status: "executed" };
    approvals.set(id, next);
    console.log(`[mock] execute ${id}`);
    await route.fulfill(jsonResponse({
      status: "completed",
      approval: next,
      result: { ok: true, runId: `exec-${id}` }
    }));
  });

  try {
    await page.goto(UI_BASE, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByPlaceholder("Type your message...").waitFor();

    await page.getByPlaceholder("Type your message...").fill("AIKA control open https://example.com");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("Approval smoke response ready.").waitFor();

    const approval1 = "apr-ui-smoke-1";
    const card1 = page.locator("div", { hasText: `Approval: ${approval1}` }).first();
    await card1.getByText(`Approval: ${approval1}`).waitFor();
    await card1.getByText("Action: Open target page and extract body text").waitFor();
    await card1.getByText("Why: Control request invokes external browser automation requiring approval.").waitFor();
    await card1.getByText("Boundary: host -> external web automation lane").waitFor();
    await card1.getByText("Approval Risk: approval_required").waitFor();
    await page.getByText("Execution protocol").first().click();
    await page
      .locator("div", { hasText: `Approval: ${approval1}` })
      .getByRole("button", { name: "Approve", exact: true })
      .first()
      .click();
    await card1.getByText("Status: approved").waitFor();
    await page
      .locator("div", { hasText: `Approval: ${approval1}` })
      .getByRole("button", { name: "Execute", exact: true })
      .first()
      .click();
    await card1.getByText("Status: executed").waitFor();
    await card1.getByText("Execution result").click();
    await card1.getByText("\"status\": \"completed\"").waitFor();

    await page.getByPlaceholder("Type your message...").fill("AIKA control open https://example.org");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("Approval smoke response ready.").nth(1).waitFor();

    const approval2 = "apr-ui-smoke-2";
    const card2 = page.locator("div", { hasText: `Approval: ${approval2}` }).first();
    await card2.getByText(`Approval: ${approval2}`).waitFor();
    await page
      .locator("div", { hasText: `Approval: ${approval2}` })
      .getByRole("button", { name: "Deny", exact: true })
      .first()
      .click();
    await card2.getByText("Status: rejected").waitFor();

    console.log("UI chat approval smoke passed.");
  } catch (err) {
    try {
      require("node:fs").mkdirSync("output/playwright", { recursive: true });
      await page.screenshot({ path: "output/playwright/ui_chat_approval_smoke_failure.png", fullPage: true });
      const html = await page.content();
      require("node:fs").writeFileSync("output/playwright/ui_chat_approval_smoke_failure.html", html, "utf8");
    } catch {
      // ignore artifact capture failures
    }
    console.error(`UI chat approval smoke failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
