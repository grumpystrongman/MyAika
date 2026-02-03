import { runVoiceFullTest } from "../voice_tests/fulltest_runner.js";

async function main() {
  const report = await runVoiceFullTest();
  for (const t of report.tests) {
    console.log(`${t.ok ? "OK  " : "FAIL"} ${t.name}${t.detail ? ` - ${t.detail}` : ""}`);
  }
  if (!report.ok) {
    console.error(`\nFull voice test FAILED (${report.failed}/${report.total}).`);
    process.exit(1);
  }
  console.log(`\nFull voice test PASSED (${report.passed}/${report.total}).`);
}

main();
