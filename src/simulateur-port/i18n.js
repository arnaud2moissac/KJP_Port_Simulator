(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KJPI18n = api.create(root.__KJP_LOCALES__, root);
})(globalThis, function () {
  "use strict";
  const STORAGE_KEY = "kjp.simulator.locale";
  function create(catalogs, host = {}) {
    catalogs = catalogs.map(catalog => ({ ...catalog, code: catalog.code.toLowerCase() }));
    const byCode = new Map(catalogs.map(catalog => [catalog.code, catalog]));
    if (!byCode.has("fr")) throw new Error("French reference catalog required");
    const listeners = new Set();
    const missing = new Set();
    const numbers = new Map();
    const plurals = new Map();
    let source = "fallback";
    const match = value => {
      const normalized = String(value || "").toLowerCase().replaceAll("_", "-");
      return byCode.has(normalized) ? normalized : byCode.has(normalized.split("-")[0])
        ? normalized.split("-")[0] : null;
    };
    let locale;
    try { locale = match(host.localStorage?.getItem(STORAGE_KEY)); } catch {}
    if (locale) source = "storage";
    else {
      try { locale = (host.navigator?.languages || [host.navigator?.language]).map(match).find(Boolean); } catch {}
      if (locale) source = "browser";
    }
    locale ||= "fr";
    function metadata() {
      const catalog = byCode.get(locale);
      if (host.document) {
        host.document.documentElement.lang = locale;
        host.document.documentElement.dir = catalog.direction;
      }
    }
    metadata();
    function t(key, params = {}) {
      const translated = byCode.get(locale).messages;
      let value = Object.prototype.hasOwnProperty.call(translated, key) ? translated[key] : undefined;
      if (value === undefined) {
        const diagnostic = `${locale}:${key}`;
        if (!missing.has(diagnostic)) host.console?.warn(`Missing translation: ${diagnostic}`);
        missing.add(diagnostic);
        const reference = byCode.get("fr").messages;
        value = Object.prototype.hasOwnProperty.call(reference, key) ? reference[key] : undefined;
      }
      if (value === undefined) return key;
      if (value && typeof value === "object") {
        if (!plurals.has(locale)) plurals.set(locale, new Intl.PluralRules(locale));
        value = value[plurals.get(locale).select(Number(params.count))] ?? value.other;
      }
      return String(value).replace(/\{(\w+)\}/g, (_, name) => {
        const parameter = params[name];
        if (parameter && typeof parameter === "object") {
          if (parameter.key) return t(parameter.key, parameter.params);
          if ("number" in parameter) return formatNumber(parameter.number, parameter.digits);
        }
        return String(parameter ?? `{${name}}`);
      });
    }
    function formatNumber(value, digits = 1) {
      const key = `${locale}:${digits}`;
      if (!numbers.has(key)) numbers.set(key, new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }));
      return numbers.get(key).format(Number(value));
    }
    function formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(locale).format(date);
    }
    function setLocale(code, options = {}) {
      const next = match(code);
      if (!next) return false;
      source = options.source || "manual";
      if (options.persist !== false) {
        try { host.localStorage?.setItem(STORAGE_KEY, next); } catch {}
      }
      if (next === locale) return true;
      locale = next;
      metadata();
      for (const listener of listeners) listener(locale);
      return true;
    }
    function apply(root = host.document) {
      if (!root) return;
      for (const element of root.querySelectorAll("[data-i18n]")) {
        element.textContent = t(element.dataset.i18n);
      }
      for (const element of root.querySelectorAll("[data-i18n-attr]")) {
        for (const binding of element.dataset.i18nAttr.split(";")) {
          const [attribute, key] = binding.split(":");
          element.setAttribute(attribute, t(key));
        }
      }
    }
    return Object.freeze({
      t, formatNumber, formatDate, setLocale, apply,
      descriptor: (key, params = {}) => ({ key, params }),
      resolve: message => message && typeof message === "object" && message.key
        ? t(message.key, message.params) : String(message ?? ""),
      getLocale: () => locale,
      getCatalog: () => byCode.get(locale),
      supportedLocales: () => catalogs.map(({ code, nativeName, shortLabel, direction }) =>
        ({ code, nativeName, shortLabel, direction })),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      report: () => ({ locale, source, available: [...byCode.keys()], missingKeys: [...missing] })
    });
  }
  return { create, STORAGE_KEY };
});
