// Looks for WordPress / Magento markers in the page HTML (read-only).
(() => {
  const cms = new Set();
  const generatorEl = document.querySelector('meta[name="generator" i]');
  const generator = generatorEl ? generatorEl.content : null;

  if (generator && /wordpress/i.test(generator)) cms.add("WordPress");
  if (generator && /magento/i.test(generator)) cms.add("Magento");

  const srcs = [...document.querySelectorAll("script[src], link[href]")]
    .map((el) => el.getAttribute("src") || el.getAttribute("href") || "");

  if (srcs.some((s) => /\/wp-(content|includes)\//i.test(s))) cms.add("WordPress");
  if (srcs.some((s) => /\/static\/version\d+\/|\/mage\/|\/skin\/frontend\//i.test(s))) cms.add("Magento");
  if (document.querySelector('script[type="text/x-magento-init"]')) cms.add("Magento");

  try {
    chrome.runtime.sendMessage({ type: "cms-hints", cms: [...cms], generator });
  } catch (_) { /* extension reloaded */ }
})();
