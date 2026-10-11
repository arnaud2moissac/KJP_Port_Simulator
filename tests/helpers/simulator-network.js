"use strict";

const analyticsScript = "https://www.googletagmanager.com/gtag/js?id=G-DQMS2JRBQ3";
const isSimulatorAnalyticsRequest = url => url === analyticsScript;

async function stubSimulatorAnalytics(page) {
  // Keep the known application script local. Renderer resources must still
  // make no other HTTP request, and qualification must send no analytics.
  await page.route(analyticsScript, route => route.fulfill({
    status: 200, body: "", contentType: "application/javascript"
  }));
}

module.exports = { isSimulatorAnalyticsRequest, stubSimulatorAnalytics };
