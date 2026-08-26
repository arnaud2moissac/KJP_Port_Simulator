"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_BLOB_URL = "https://github.com/arnaud2moissac/KJP_Port_Simulator/blob/main/";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function localImageDataUri(root, relativePath) {
  const cleanPath = relativePath.split(/[?#]/, 1)[0];
  const absolutePath = path.resolve(root, cleanPath);
  if (!absolutePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolutePath)) return null;
  const extension = path.extname(absolutePath).toLowerCase();
  const mime = extension === ".png"
    ? "image/png"
    : extension === ".svg"
      ? "image/svg+xml"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(absolutePath).toString("base64")}`;
}

function safeLinkTarget(target) {
  if (/^https?:\/\//i.test(target)) return target;
  if (target.startsWith("#")) return target;
  return `${REPOSITORY_BLOB_URL}${target.replace(/^\.\//, "")}`;
}

function renderPlainText(text) {
  const urlPattern = /https?:\/\/[^\s<]+/g;
  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    output += escapeHtml(text.slice(cursor, match.index));
    const url = match[0];
    output += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    cursor = match.index + url.length;
  }
  return output + escapeHtml(text.slice(cursor));
}

function renderInline(text, root) {
  const tokenPattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(tokenPattern)) {
    output += renderPlainText(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      const source = localImageDataUri(root, match[2]) || safeLinkTarget(match[2]);
      output += `<img src="${escapeHtml(source)}" alt="${escapeHtml(match[1])}">`;
    } else if (match[3] !== undefined) {
      const target = safeLinkTarget(match[4]);
      const external = /^https?:\/\//i.test(target);
      output += `<a href="${escapeHtml(target)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(match[3])}</a>`;
    } else if (match[5] !== undefined) {
      output += `<code>${escapeHtml(match[5])}</code>`;
    } else {
      output += `<strong>${escapeHtml(match[6])}</strong>`;
    }
    cursor = match.index + match[0].length;
  }
  return output + renderPlainText(text.slice(cursor));
}

function renderReadme(markdown, root) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let codeLanguage = "";
  let codeLines = null;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(" "), root)}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      closeParagraph();
      closeList();
      if (codeLines) {
        html.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
        codeLanguage = "";
      } else {
        codeLines = [];
        codeLanguage = fence[1] || "";
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(heading[1].length + 1, 6);
      html.push(`<h${level}>${renderInline(heading[2], root)}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^\s*(-|\*|\d+\.)\s+(.+)$/);
    if (listItem) {
      closeParagraph();
      const nextType = /\d+\./.test(listItem[1]) ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${renderInline(listItem[2], root)}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    paragraph.push(line.trim());
  }
  closeParagraph();
  closeList();
  if (codeLines) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return html.join("\n");
}

function projectAssets(root) {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const logo = fs.readFileSync(path.join(root, "assets", "kjp-port-simulator-logo.png"));
  return {
    logoDataUri: `data:image/png;base64,${logo.toString("base64")}`,
    readmeHtml: renderReadme(readme, root)
  };
}

module.exports = { projectAssets, renderReadme };
