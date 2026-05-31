// ClipClass - YouTube Caption Scraper and Timed Segment Extractor
// Using global fetch (available in Node.js 18+)

/**
 * Parses millisecond duration into standard MM:SS or HH:MM:SS format
 */
export function formatTimestamp(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  
  const paddedSecs = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    const paddedMins = minutes.toString().padStart(2, '0');
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${paddedSecs}`;
}

/**
 * Resiliently fetches transcript data for a given YouTube Video ID.
 * Returns:
 * {
 *   fullText: string,
 *   timedSegments: Array<{ time: string, startMs: number, text: string }>
 * }
 */
export async function fetchYouTubeTranscript(videoId) {
  if (!videoId) {
    throw new Error("No YouTube Video ID provided.");
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to request YouTube watch page: Status ${response.status}`);
  }

  const html = await response.text();

  // Extract the player response JSON containing captions
  let playerResponseText = null;
  const regexes = [
    /ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|const|let|function|window)/,
    /ytInitialPlayerResponse\s*=\s*({.+?});/,
    /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/,
    /"ytInitialPlayerResponse"\s*:\s*({.+?})\s*,\s*"playerAds"/
  ];

  for (const regex of regexes) {
    const match = html.match(regex);
    if (match && match[1]) {
      playerResponseText = match[1];
      break;
    }
  }

  if (!playerResponseText) {
    throw new Error("Unable to locate ytInitialPlayerResponse. The video page structure has changed, or it is age-restricted.");
  }

  let playerResponse;
  try {
    playerResponse = JSON.parse(playerResponseText);
  } catch (e) {
    throw new Error("Failed to parse YouTube player configuration payload.");
  }

  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
  if (!captions || !captions.captionTracks || captions.captionTracks.length === 0) {
    throw new Error("Captions are disabled or not available for this video.");
  }

  // Find English captions if possible, otherwise default to first available track
  let selectedTrack = captions.captionTracks.find(track => track.languageCode === 'en' || track.vssId?.includes('en'));
  if (!selectedTrack) {
    selectedTrack = captions.captionTracks[0];
  }

  // Append formatting parameter to fetch structured JSON format rather than XML
  const transcriptUrl = selectedTrack.baseUrl + '&fmt=json3';
  
  const transcriptResponse = await fetch(transcriptUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!transcriptResponse.ok) {
    throw new Error(`Failed to fetch transcript track: Status ${transcriptResponse.status}`);
  }

  const data = await transcriptResponse.json();
  if (!data || !data.events) {
    throw new Error("Transcript payload did not contain valid timeline events.");
  }

  // Parse structured timeline events
  const segments = [];
  let fullTextParts = [];

  for (const event of data.events) {
    if (!event.segs || event.segs.length === 0) continue;
    
    // Extract textual segment segment
    const segmentText = event.segs
      .map(seg => seg.utf8)
      .join('')
      .replace(/\n/g, ' ')
      .trim();

    if (!segmentText) continue;

    const startMs = event.tStartMs || 0;
    
    segments.push({
      startMs: startMs,
      time: formatTimestamp(startMs),
      text: segmentText
    });
    
    fullTextParts.push(segmentText);
  }

  // Optimize and merge segments into larger logical chronological units (e.g. ~45 seconds - 1 minute chunks)
  // to avoid sending hundreds of tiny lines to the LLM.
  const groupedSegments = [];
  let currentGroup = null;
  const groupWindowMs = 45000; // 45 seconds

  for (const seg of segments) {
    if (!currentGroup) {
      currentGroup = {
        startMs: seg.startMs,
        time: seg.time,
        texts: [seg.text]
      };
    } else if (seg.startMs - currentGroup.startMs < groupWindowMs) {
      currentGroup.texts.push(seg.text);
    } else {
      groupedSegments.push({
        time: currentGroup.time,
        startMs: currentGroup.startMs,
        text: currentGroup.texts.join(' ')
      });
      currentGroup = {
        startMs: seg.startMs,
        time: seg.time,
        texts: [seg.text]
      };
    }
  }

  if (currentGroup) {
    groupedSegments.push({
      time: currentGroup.time,
      startMs: currentGroup.startMs,
      text: currentGroup.texts.join(' ')
    });
  }

  return {
    fullText: fullTextParts.join(' '),
    timedSegments: groupedSegments
  };
}
