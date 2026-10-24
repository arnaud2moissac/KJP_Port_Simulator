const { create } = require("../simulateur-port/i18n.js");

export const i18n = create(window.__KJP_GENERATOR_LOCALES__, window, {
  storageKey: "kjp.generator.locale"
});
export const t = i18n.t;
export const msg = i18n.descriptor;
export const resolve = i18n.resolve;
export const num = (number, digits = 1) => ({ number, digits });

// Keep message descriptors on their DOM nodes so an active toast or async
// progress message can change language without restarting the operation.
const messageProperty = Symbol("generatorMessage");
export function setText(element, message) {
  element[messageProperty] = message;
  element.textContent = resolve(message);
}

export function refreshTranslations() {
  i18n.apply();
  for (const element of document.querySelectorAll("*")) {
    if (messageProperty in element) element.textContent = resolve(element[messageProperty]);
  }
}
