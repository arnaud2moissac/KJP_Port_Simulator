"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { babelParse, traverse } = require("../node_modules/playwright/lib/transform/babelBundle.js");
const { loadCatalogs, localizedTemplate } = require("./localization-assets.js");
const root = path.resolve(__dirname, "..");
function check() {
  const catalogs = loadCatalogs();
  const reference = catalogs.find(catalog => catalog.code === "fr").messages;
  const source = fs.readFileSync(path.join(root, "src/simulateur-port/template.html"), "utf8");
  localizedTemplate(source, catalogs);
  const start = source.indexOf("  (() => {");
  const script = source.slice(start, source.lastIndexOf("</script>"));
  const ast = babelParse(script, "simulator.js");
  const failures = [];
  const neutral = /^(?:[\s\d.,+−%°·/×:()–—▶Ⅱ-]*|N|N·m|kN|kN·m|m|kg|G|N|0°|R|C)$/;
  function inspect(node, line) {
    if (!node) return;
    if (node.type === "CallExpression" && ["t", "msg"].includes(node.callee.name)) return;
    if (node.type === "StringLiteral" && !neutral.test(node.value.trim())) failures.push(`${line}: literal display text ${JSON.stringify(node.value)}`);
    if (node.type === "TemplateLiteral") {
      for (const quasi of node.quasis) if (!neutral.test(quasi.value.cooked.trim())) {
        failures.push(`${line}: literal template display text ${JSON.stringify(quasi.value.cooked)}`);
      }
    }
    if (node.type === "ConditionalExpression") { inspect(node.consequent, line); inspect(node.alternate, line); }
    if (["LogicalExpression", "BinaryExpression"].includes(node.type)) { inspect(node.left, line); inspect(node.right, line); }
    // Interpolated parameters and generated DOM nodes are checked by browser tests.
  }
  traverse(ast, {
    CallExpression(p) {
      const node = p.node;
      if (["t", "msg"].includes(node.callee.name) && node.arguments[0]?.type === "StringLiteral") {
        if (!(node.arguments[0].value in reference)) failures.push(`Unknown key: ${node.arguments[0].value}`);
      }
      if (node.callee.name === "setText") inspect(node.arguments[1], node.loc.start.line);
      if (node.callee.name === "showStageToast") inspect(node.arguments[0], node.loc.start.line);
      if (node.callee.type === "MemberExpression" && node.callee.property.name === "setAttribute"
        && ["aria-label", "aria-valuetext", "title"].includes(node.arguments[0]?.value)) {
        inspect(node.arguments[1], node.loc.start.line);
      }
    },
    NewExpression(p) { if (p.node.callee.name === "Option") inspect(p.node.arguments[0], p.node.loc.start.line); },
    AssignmentExpression(p) {
      if (p.node.left.type === "MemberExpression" && ["textContent", "title", "label"].includes(p.node.left.property.name)) {
        inspect(p.node.right, p.node.loc.start.line);
      }
    },
    ObjectProperty(p) {
      if (p.node.key.name === "text" && p.parent.properties.some(property => property.key?.name === "level")) {
        inspect(p.node.value, p.node.loc.start.line);
      }
    }
  });
  // Ensure all static visible words/attributes have bindings. Constants and technical symbols are explicit exceptions.
  const html = source.slice(0, source.indexOf('<script>\n/*__KJP_I18N__*/'));
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*)>([^<]*)/g)) {
    const [, tag, attrs, raw] = match;
    if (["script", "style"].includes(tag)) continue;
    if (/[A-Za-zÀ-ÿ]/.test(raw.trim()) && !attrs.includes("data-i18n=")
      && !/^(KJP Port Simulator|N·m|kg|G|N|Q|W|P|R)$/.test(raw.trim())) {
      failures.push(`Unbound HTML text: ${raw.trim().slice(0, 100)}`);
    }
    for (const attribute of attrs.matchAll(/\b(aria-label|title|alt|label)="([^"]+)"/g)) {
      if (!attrs.includes(`data-i18n-attr="`) && !attrs.includes("data-i18n-attr='")) {
        failures.push(`Unbound HTML ${attribute[1]}: ${attribute[2]}`);
      }
    }
  }
  for (const file of ["src/simulateur-port/physics-core.js", "src/ports/kjp-codec.js"]) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    const parsed = babelParse(content, "metadata.js");
    traverse(parsed, { ObjectProperty(p) {
      if (p.node.key.name === "reason" && (!p.parent.properties.some(property => property.key?.name === "reasonCode")
        || !p.parent.properties.some(property => property.key?.name === "reasonParams"))) failures.push(`Missing interaction metadata in ${file}`);
      if (["reasonCode", "messageKey"].includes(p.node.key.name) && p.node.value.type === "StringLiteral"
        && !(p.node.value.value in reference)) failures.push(`Unknown metadata key: ${p.node.value.value}`);
    }, StringLiteral(p) {
      if (/^(force|interaction|validation)\./.test(p.node.value) && !(p.node.value in reference)) failures.push(`Unknown metadata key: ${p.node.value}`);
    } });
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`${catalogs.length} languages, ${Object.keys(reference).length} messages: catalogs, guides, bindings and display sinks validated.`);
}
if (require.main === module) check();
module.exports = { check };
