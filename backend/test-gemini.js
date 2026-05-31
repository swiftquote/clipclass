import { generateWorksheetContent } from './ai.js';

async function testGeminiConnection() {
  console.log("==================================================");
  console.log("🧪 Testing Real Google Gemini API Connection...");
  console.log("==================================================");

  // Mock timeline segments to send to Gemini
  const mockSegments = [
    { time: "00:05", text: "Welcome to this lesson about how photosynthesis works in plants." },
    { time: "01:20", text: "Photosynthesis is the process where plants convert light energy into chemical energy." },
    { time: "02:45", text: "They take in carbon dioxide from the air and water from the soil through roots." },
    { time: "04:15", text: "Inside the leaf cells, chloroplasts use chlorophyll to capture sunlight." },
    { time: "06:00", text: "The sunlight splits water molecules, producing oxygen which is released into the air." },
    { time: "07:30", text: "Finally, plants synthesize glucose, which is sugar, to feed and grow." },
    { time: "09:00", text: "In conclusion, photosynthesis provides energy for plants and oxygen for all animals." }
  ];

  try {
    console.log("Sending request to Gemini 1.5 Flash using the configured API Key...");
    const result = await generateWorksheetContent({
      timedSegments: mockSegments,
      ageGroup: "8-10",
      ellSupport: true,
      gamifiedTrivia: true
    });

    console.log("\n✅ GEMINI API CONNECTION SUCCEEDED!");
    console.log("==================================================");
    console.log("Received AI synthesized payload successfully:");
    console.log(`- Summary: ${result.summary}`);
    console.log(`- Spanish Summary: ${result.spanishSummary}`);
    console.log(`- Questions Count: ${result.questions?.length}`);
    console.log(`- Answers Count: ${result.teacherAnswers?.length}`);
    console.log(`- Trivia Script Title: ${result.triviaScript?.gameTitle}`);
    console.log("==================================================");
    
  } catch (err) {
    console.error("\n❌ GEMINI API CONNECTION FAILED!");
    console.error(err.message);
    console.log("==================================================");
  }
}

testGeminiConnection();
