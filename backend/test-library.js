import { YoutubeTranscript } from 'youtube-transcript';

async function testLib() {
  try {
    console.log("Fetching transcript using youtube-transcript library...");
    const transcript = await YoutubeTranscript.fetchTranscript('9bCad3kI85c');
    console.log("Success! Transcript lines count:", transcript.length);
    console.log("First few lines:", transcript.slice(0, 3));
  } catch (err) {
    console.error("Library failed too! Error:", err);
  }
}

testLib();
