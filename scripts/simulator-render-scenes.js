"use strict";

// Matrice commune aux références Legacy et à la qualification tolérante du
// renderer natif. Les identifiants restent ceux du manifeste historique.
module.exports = Object.freeze([
  Object.freeze({ id: "built-in-dark-top-navigation", port: "built-in", theme: "dark", view: "top", mode: "navigation" }),
  Object.freeze({
    id: "built-in-chart-top-understand", port: "built-in", theme: "chart", view: "top", mode: "understand",
    environment: Object.freeze({ windSpeedKn: 12, windFromDeg: 300, currentSpeedKn: 1.4, currentFromDeg: 215 })
  }),
  Object.freeze({ id: "built-in-dark-anatomy-understand", port: "built-in", theme: "dark", view: "anatomy", mode: "understand" }),
  Object.freeze({ id: "built-in-chart-skipper-navigation", port: "built-in", theme: "chart", view: "skipper", mode: "navigation" }),
  Object.freeze({ id: "la-trinite-dark-top-navigation", port: "la-trinite-sur-mer", theme: "dark", view: "top", mode: "navigation" }),
  Object.freeze({ id: "la-trinite-chart-skipper-navigation", port: "la-trinite-sur-mer", theme: "chart", view: "skipper", mode: "navigation" })
]);
