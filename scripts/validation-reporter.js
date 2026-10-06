"use strict";
const fs = require("node:fs");
module.exports = async function* report(source) {
  const cases = [], diagnostics = [];
  for await (const event of source) {
    if (["test:pass", "test:fail"].includes(event.type) && !event.data.skip && event.data.details?.type !== "suite") {
      const row = { name: event.data.name, file: event.data.file,
        status: event.type === "test:pass" ? "passed" : "failed", durationMs: event.data.details?.duration_ms || 0 };
      cases.push(row);
      yield `${row.status === "passed" ? "✔" : "✖"} ${row.name} (${row.durationMs.toFixed(0)} ms)\n`;
      if (event.data.details?.error) {
        const error = event.data.details.error.cause || event.data.details.error;
        yield require("node:util").inspect({ message: error.message.split("\n").slice(0, 8).join("\n"),
          actual: error.actual, expected: error.expected, stack: error.stack?.split("\n").slice(0, 10).join("\n") }, { depth: 4 }) + "\n";
      }
    }
    if (event.type === "test:diagnostic") diagnostics.push(event.data.message);
  }
  if (process.env.KJP_TEST_REPORT) fs.writeFileSync(process.env.KJP_TEST_REPORT,
    JSON.stringify({ cases, diagnostics }, null, 2));
};
