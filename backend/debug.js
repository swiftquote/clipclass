import fetch from 'node-fetch'; // wait, node-fetch isn't imported, let's use global fetch
import fs from 'fs';

async function debug() {
  const videoId = "9bCad3kI85c";
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  const html = await response.text();
  fs.writeFileSync('watch.html', html);

  const regexes = [
    /ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|const|let|function|window)/,
    /ytInitialPlayerResponse\s*=\s*({.+?});/,
    /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/,
    /"ytInitialPlayerResponse"\s*:\s*({.+?})\s*,\s*"playerAds"/
  ];

  let match = null;
  for (const regex of regexes) {
    match = html.match(regex);
    if (match) {
      console.log("Matched regex:", regex);
      break;
    }
  }

  if (match) {
    try {
      const playerResponse = JSON.parse(match[1]);
      console.log("playerResponse keys:", Object.keys(playerResponse));
      console.log("playabilityStatus:", playerResponse.playabilityStatus);
      console.log("captions exist?", !!playerResponse.captions);
      if (playerResponse.captions) {
        console.log("captions keys:", Object.keys(playerResponse.captions));
        console.log("playerCaptionsTracklistRenderer keys:", Object.keys(playerResponse.captions.playerCaptionsTracklistRenderer || {}));
        console.log("captionTracks:", playerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks);
      } else {
        console.log("No captions field in playerResponse!");
      }
    } catch (e) {
      console.log("JSON parse failed:", e.message);
    }
  } else {
    console.log("No match found for ytInitialPlayerResponse!");
  }
}

debug();
