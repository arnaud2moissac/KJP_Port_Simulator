import { i18n, t } from "./i18n.js";
const { createPublicLibrary } = require("../ports/port-library.js");

export function installLibraryInterface({ exportText, importText, downloadPort, filename, showToast, exportError }) {
  const library = createPublicLibrary();
  const dialog = document.querySelector("#portFileDialog");
  const $ = selector => dialog.querySelector(selector);
  let mode = "load", controller, rows = [], busy = false, error = null, status = "";
  function errorText(cause) {
    return cause?.libraryCode ? t(`storage.${cause.libraryCode}`) : t("storage.network");
  }
  function render() {
    $("#portFileTitle").dataset.i18n = mode === "save" ? "files.save" : "files.load";
    $("#portFileTitle").textContent = t($("#portFileTitle").dataset.i18n);
    $("#localImportButton").hidden = mode !== "load";
    $("#localExportButton").hidden = mode !== "save";
    $("#publicPortList").hidden = mode !== "load";
    $("#publicSaveButton").hidden = mode !== "save";
    $("#publicSaveButton").disabled = busy || !library.configured();
    $("#refreshPublicLibrary").disabled = busy;
    $("#publicLibraryStatus").textContent = error ? errorText(error) : status ? t(status)
      : mode === "save" ? t(!library.configured() ? "storage.not.configured" : "files.ready")
        : t(rows.length ? "files.choose" : "files.empty");
    $("#publicLibraryStatus").dataset.error = String(Boolean(error));
    const elements = rows.map(row => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = [row.metadata.name || row.filename, row.metadata.author].filter(Boolean).join(" · ");
      if (row.error) label.textContent += " · " + errorText(row.error);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button ghost";
      button.textContent = t("files.open");
      button.setAttribute("aria-label", t("files.open.named", { name: row.metadata.name || row.filename }));
      button.disabled = busy || !row.ready;
      button.addEventListener("click", () => { void load(row); });
      item.append(label, button);
      return item;
    });
    $("#publicPortList").replaceChildren(...elements);
  }
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    busy = true; error = null; status = "files.loading"; rows = []; render();
    try {
      const catalog = await library.catalog(request.signal);
      if (controller === request && !request.signal.aborted) rows = catalog.rows;
    } catch (cause) { if (!request.signal.aborted && controller === request) error = cause; }
    finally {
      if (controller === request) { busy = false; status = ""; render(); }
    }
  }
  async function load(row) {
    const request = controller;
    busy = true; error = null; status = "files.loading"; render();
    try {
      const text = await library.load(row, request.signal);
      if (request.signal.aborted || controller !== request) return;
      importText(text);
      dialog.close();
    } catch (cause) {
      if (!request.signal.aborted && controller === request) error = cause.libraryCode ? cause : { libraryCode: "invalid.port" };
    } finally { if (controller === request) { busy = false; status = ""; render(); } }
  }
  function open(nextMode) {
    if (busy) return;
    if (nextMode === "save") {
      try { exportText(); } catch { exportError(); return; }
    }
    mode = nextMode; error = null; status = "";
    dialog.showModal();
    render();
    if (mode === "load") void refresh();
  }
  $("#localImportButton").addEventListener("click", () => { dialog.close(); document.querySelector("#importInput").click(); });
  $("#localExportButton").addEventListener("click", () => { dialog.close(); downloadPort(); });
  $("#closePortFile").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    controller?.abort();
    if (!busy) document.querySelector(mode === "save" ? "#exportButton" : "#importButton").focus();
  });
  $("#refreshPublicLibrary").addEventListener("click", () => { void refresh(); });
  $("#publicSaveButton").addEventListener("click", async () => {
    if (busy) return;
    let text;
    try { text = exportText(); } catch { dialog.close(); exportError(); return; }
    busy = true; error = null; status = "files.saving";
    dialog.close();
    document.querySelector("#importButton").disabled = document.querySelector("#exportButton").disabled = true;
    showToast(t("files.saving"));
    try {
      const result = await library.save({ text, filename: filename(),
        confirmOverwrite: name => window.confirm(t("files.overwrite", { name })) });
      showToast(t(result ? "files.saved" : "files.cancelled"), result ? "ok" : undefined);
    } catch (cause) {
      error = cause; status = "";
      dialog.showModal();
    } finally {
      busy = false; status = "";
      document.querySelector("#importButton").disabled = document.querySelector("#exportButton").disabled = false;
      render();
    }
  });
  i18n.subscribe(render);
  return { open };
}
