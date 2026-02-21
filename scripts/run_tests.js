const { execSync } = require("node:child_process");

const env = { ...process.env, NODE_ENV: "test" };

execSync("node --test apps/server/tests/*.test.js", {
  stdio: "inherit",
  env
});
