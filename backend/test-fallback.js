import dotenv from 'dotenv';
import { generateBlooketContent } from './blooket.js';
import { generateWorksheetContent } from './ai.js';

dotenv.config();

async function generateFallbackTranscript(videoTitle) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here' || apiKey === '') {
    throw new Error("Gemini API key is not configured.");
  }
  
  const systemPrompt = `You are an expert pedagogical curriculum developer. Your task is to analyze the provided educational video title and generate a chronological, content-rich 5-paragraph summary of the topic.
Each paragraph must detail a specific key concept, fact, or definition that would naturally be taught in a video with this title.
Do NOT write about the video itself (e.g. do not say "In this video, the speaker discusses..." or "The video explains..."). Write the direct, factual, educational content/facts as if it were a clean, factual transcript script.
Output a single, valid JSON object containing exactly 5 segments:
{
  "segments": [
    "Paragraph 1 text (Introduction and context)...",
    "Paragraph 2 text (First main concept)...",
    "Paragraph 3 text (Second main concept)...",
    "Paragraph 4 text (Detailed examples or applications)...",
    "Paragraph 5 text (Summary & takeaways)..."
  ]
}
Return ONLY raw JSON. Do not include markdown code block formatting (\`\`\`json) in your actual payload.`;

  const userPrompt = `Video Title: "${videoTitle}"`;
  
  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[Transcript Fallback] Attempting topic generation using model: ${modelName}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${userPrompt}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.35
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Model ${modelName} responded with status ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const contentText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!contentText) {
        throw new Error(`Model ${modelName} did not return content text.`);
      }

      const payload = JSON.parse(contentText.trim());
      console.log(`[Transcript Fallback] Successfully generated topic segments using model: ${modelName}`);
      return payload.segments || [];

    } catch (err) {
      console.warn(`[Transcript Fallback] Model ${modelName} failed: ${err.message}. Retrying next candidate...`);
      lastError = err;
    }
  }

  throw new Error(`Fallback transcript generation failed: ${lastError.message}`);
}

async function runTest() {
  const videoTitle = "Mehdi Hasan Debates: Qatar, Money, and Media";
  console.log(`Testing with video title: "${videoTitle}"`);

  try {
    const segments = await generateFallbackTranscript(videoTitle);
    console.log("\nGenerated segments:", segments);

    const timedSegments = [
      { time: "00:05", text: segments[0] },
      { time: "02:15", text: segments[1] },
      { time: "04:30", text: segments[2] },
      { time: "07:00", text: segments[3] },
      { time: "09:15", text: segments[4] }
    ];

    console.log("\n==================================================");
    console.log("Generating Blooket Content...");
    const blooketResult = await generateBlooketContent({ timedSegments, ageGroup: "14-16" });
    console.log("\nGenerated Blooket Questions:");
    blooketResult.questions.forEach((q, idx) => {
      console.log(`${idx + 1}. ${q.question}`);
      q.options.forEach((opt, oIdx) => console.log(`   ${String.fromCharCode(65 + oIdx)}) ${opt}`));
      console.log(`   Correct: ${q.correctAnswer}\n`);
    });

    console.log("==================================================");
    console.log("Generating Worksheet Content...");
    const worksheetResult = await generateWorksheetContent({
      timedSegments,
      ageGroup: "14-16",
      questionsCount: 5
    });
    console.log("\nGenerated Worksheet Questions:");
    worksheetResult.questions.forEach((q, idx) => {
      console.log(`${idx + 1} (${q.timestamp}). ${q.question}`);
    });

    console.log("\nGenerated Worksheet Teacher Answers:");
    worksheetResult.teacherAnswers.forEach((ta, idx) => {
      console.log(`${idx + 1} (${ta.timestamp}). Q: ${ta.question}`);
      console.log(`   A: ${ta.answer}\n`);
    });

  } catch (err) {
    console.error("Test failed:", err);
  }
}

runTest();
