// Wizard Chess UI smoke test (Playwright)
// Usage: node scripts/ui_wizard_chess_smoke.js
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

  await page.route("**/api/auth/me", async route => {
    await route.fulfill(jsonResponse({
      authRequired: false,
      authenticated: true,
      user: {
        id: "ui-wizard-smoke-user",
        name: "UI Wizard Smoke",
        email: "ui-wizard-smoke@example.com"
      }
    }));
  });

  let engineCalls = 0;
  let moveCalls = 0;
  await page.route("**/api/chess/engine-move", async route => {
    engineCalls += 1;
    const body = route.request().postDataJSON?.() || {};
    const purpose = String(body?.purpose || "move");
    if (purpose === "hint") {
      await route.fulfill(jsonResponse({
        ok: true,
        move: "g1f3",
        bestMove: "g1f3",
        preset: body?.preset || "clever",
        purpose: "hint",
        softened: false,
        evaluation: {
          sideToMove: "w",
          scoreType: "cp",
          scoreValue: 26,
          scoreCpSideToMove: 26,
          scoreWhiteCp: 26
        },
        candidates: [{ move: "g1f3", scoreCp: 26, depth: 10 }]
      }));
      return;
    }

    moveCalls += 1;
    if (moveCalls === 1) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    await route.fulfill(jsonResponse({
      ok: true,
      move: "d7d5",
      bestMove: "d7d5",
      preset: body?.preset || "clever",
      purpose: "move",
      softened: false,
      evaluation: {
        sideToMove: "b",
        scoreType: "cp",
        scoreValue: -18,
        scoreCpSideToMove: -18,
        scoreWhiteCp: 18
      },
      candidates: [{ move: "e7e5", scoreCp: -18, depth: 12 }]
    }));
  });

  try {
    await page.goto(`${UI_BASE}/wizard-chess`, { waitUntil: "networkidle" });
    await page.getByText("Wizard Chess: Aika Duel Chamber").first().waitFor();
    await page.getByLabel("Encounter").waitFor();
    await page.getByLabel("Universe Pack").waitFor();
    await page.getByLabel("Board Theme").waitFor();
    await page.getByLabel("Army Theme").waitFor();
    await page.getByLabel("Voice Profile").waitFor();
    await page.getByText("Battle SFX").first().waitFor();
    await page.getByLabel("Cinematic Intensity").waitFor();
    await page.getByRole("button", { name: "Test Voice" }).waitFor();

    await page.waitForFunction(() => Boolean(window.__WIZARD_CHESS_TEST));
    await page.getByLabel("Universe Pack").selectOption("medieval_vs_zombies");
    await page.waitForTimeout(120);
    const spriteProbe = await page.evaluate(() => {
      const whitePawn = document.querySelector(".wizard-board piece.white.pawn");
      const blackPawn = document.querySelector(".wizard-board piece.black.pawn");
      if (!whitePawn || !blackPawn) return null;
      const whiteBg = window.getComputedStyle(whitePawn).backgroundImage || "";
      const blackBg = window.getComputedStyle(blackPawn).backgroundImage || "";
      return { whiteBg, blackBg };
    });
    if (!spriteProbe) throw new Error("piece_sprite_probe_missing");
    if (!String(spriteProbe.whiteBg).includes("medieval_order") || !String(spriteProbe.blackBg).includes("graveborn_horde")) {
      throw new Error(`piece_sprites_not_applied:${JSON.stringify(spriteProbe)}`);
    }

    const blackBefore = await page.evaluate(() => window.__WIZARD_CHESS_TEST.getClocks().blackMs);
    const moveAccepted = await page.evaluate(() => window.__WIZARD_CHESS_TEST.playUci("e2e4"));
    if (!moveAccepted) throw new Error("wizard_test_move_rejected");
    await page.waitForTimeout(700);
    const blackDuring = await page.evaluate(() => window.__WIZARD_CHESS_TEST.getClocks().blackMs);
    if (!(Number(blackDuring) < Number(blackBefore))) {
      throw new Error(`clock_not_decrementing_for_ai:black_before=${blackBefore},black_during=${blackDuring}`);
    }

    await page.waitForFunction(() => {
      const history = window.__WIZARD_CHESS_TEST?.getHistory?.() || [];
      return Array.isArray(history) && history.length >= 2;
    });

    const history = await page.evaluate(() => window.__WIZARD_CHESS_TEST.getHistory());
    if (!Array.isArray(history) || history.length < 2 || history[0] !== "e4" || history[1] !== "d5") {
      throw new Error(`unexpected_history:${JSON.stringify(history)}`);
    }
    const captureAccepted = await page.evaluate(() => window.__WIZARD_CHESS_TEST.playUci("e4d5"));
    if (!captureAccepted) throw new Error("capture_move_rejected");
    await page.waitForTimeout(180);
    const battleProbe = await page.evaluate(() => window.__WIZARD_CHESS_TEST.getBattleState());
    if (!battleProbe?.hasBattleFx && !battleProbe?.hasDuelCutscene) {
      throw new Error(`battle_effect_missing:${JSON.stringify(battleProbe)}`);
    }

    const scrollProbe = await page.evaluate(() => {
      const chat = document.querySelector(".wizard-chat-stream");
      if (!chat) return null;
      const overflowY = window.getComputedStyle(chat).overflowY;
      for (let i = 0; i < 45; i += 1) {
        const line = document.createElement("div");
        line.className = "wizard-chat-line";
        line.textContent = `smoke-log-${i}`;
        chat.appendChild(line);
      }
      return {
        overflowY,
        scrollHeight: chat.scrollHeight,
        clientHeight: chat.clientHeight
      };
    });
    if (!scrollProbe) throw new Error("chat_stream_missing");
    if (!["auto", "scroll"].includes(String(scrollProbe.overflowY || "").toLowerCase())) {
      throw new Error(`chat_overflow_not_scrollable:${scrollProbe.overflowY}`);
    }
    if (!(Number(scrollProbe.scrollHeight) > Number(scrollProbe.clientHeight))) {
      throw new Error(`chat_not_overflowing:${JSON.stringify(scrollProbe)}`);
    }

    await page.setViewportSize({ width: 980, height: 760 });
    await page.waitForTimeout(120);
    await page.setViewportSize({ width: 760, height: 980 });
    await page.waitForTimeout(120);
    await page.waitForSelector(".wizard-board");
    await page.waitForSelector(".wizard-chat-stream");
    const boardProbe = await page.evaluate(() => {
      const board = document.querySelector(".wizard-board .cg-wrap") || document.querySelector(".wizard-board");
      const chat = document.querySelector(".wizard-chat-stream");
      if (!board || !chat) return null;
      const b = board.getBoundingClientRect();
      const c = chat.getBoundingClientRect();
      return {
        boardW: b.width,
        boardH: b.height,
        boardRatio: b.width / Math.max(1, b.height),
        chatH: c.height
      };
    });
    if (!boardProbe) throw new Error("responsive_probe_missing");
    if (boardProbe.boardW < 240 || boardProbe.boardH < 240 || boardProbe.chatH < 120) {
      throw new Error(`responsive_layout_failed:${JSON.stringify(boardProbe)}`);
    }
    if (Math.abs(Number(boardProbe.boardRatio) - 1) > 0.06) {
      throw new Error(`board_not_square:${JSON.stringify(boardProbe)}`);
    }

    if (engineCalls < 1) throw new Error("engine_not_called");
    await page.getByText("Aika Presence").first().waitFor();
    console.log("UI wizard chess smoke passed.");
  } catch (err) {
    try {
      require("node:fs").mkdirSync("output/playwright", { recursive: true });
      await page.screenshot({ path: "output/playwright/ui_wizard_chess_smoke_failure.png", fullPage: true });
      const html = await page.content();
      require("node:fs").writeFileSync("output/playwright/ui_wizard_chess_smoke_failure.html", html, "utf8");
    } catch {
      // ignore artifact capture failures
    }
    console.error(`UI wizard chess smoke failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
