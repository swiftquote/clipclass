// ClipClass Minimalist Content Script
console.log("ClipClass Content Script Injected.");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getVideoMetadata") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');

      if (!videoId) {
        sendResponse({ success: false, error: "No YouTube video ID detected." });
        return true;
      }

      // Safe metadata parsing
      const titleElement = document.querySelector("h1.ytd-watch-metadata yt-formatted-string") || 
                           document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer") ||
                           document.querySelector("meta[name='title']");
      const videoTitle = titleElement ? (titleElement.content || titleElement.textContent || titleElement.innerText) : document.title.replace(" - YouTube", "");

      const channelElement = document.querySelector("#upload-info #channel-name a") ||
                             document.querySelector("ytd-channel-name a");
      const channelName = channelElement ? (channelElement.textContent || channelElement.innerText) : "";

      sendResponse({
        success: true,
        videoId: videoId,
        videoTitle: videoTitle.trim(),
        channelName: channelName.trim(),
        url: window.location.href
      });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  return true; // Keep message port open
});
