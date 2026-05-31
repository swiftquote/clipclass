// ClipClass Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("ClipClass Extension has been successfully installed in Developer Mode.");
});

// A service worker can act as a router or auth helper in future iterations.
// Currently activeTab messaging is directed straight from popup.js to content.js.
