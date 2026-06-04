import { generateBlooketContent } from './blooket.js';

function convertToCSV(questions) {
  const headers = ["Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Correct Answer", "Time Limit"];
  const escapeField = (field) => {
    if (field === undefined || field === null) return '""';
    const str = String(field);
    return `"${str.replace(/"/g, '""')}"`;
  };
  
  const rows = [
    headers.map(escapeField).join(',')
  ];
  
  for (const q of questions) {
    const row = [
      q.question,
      q.options?.[0] || "",
      q.options?.[1] || "",
      q.options?.[2] || "",
      q.options?.[3] || "",
      q.correctAnswer || "",
      q.timeLimit || 20
    ];
    rows.push(row.map(escapeField).join(','));
  }
  
  return rows.join('\r\n');
}

async function testBlooket() {
  console.log("==================================================");
  console.log("🧪 Testing Blooket Game Generation...");
  console.log("==================================================");

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
    console.log("Calling generateBlooketContent to generate 15 MCQ questions...");
    const result = await generateBlooketContent({
      timedSegments: mockSegments,
      ageGroup: "8-10"
    });

    console.log("\n✅ AI Synthesis Succeeded!");
    console.log(`Received ${result.questions?.length} questions.`);

    console.log("\nConverting to CSV format...");
    const csv = convertToCSV(result.questions);
    console.log("==================================================");
    console.log("COMPILED CSV PREVIEW (First 5 lines):");
    console.log(csv.split('\r\n').slice(0, 5).join('\n'));
    console.log("==================================================");
    
    // Verify that we have exactly 15 questions
    if (result.questions?.length === 15) {
      console.log("✨ SUCCESS: Generated exactly 15 questions as requested!");
    } else {
      console.warn(`⚠️ WARNING: Expected 15 questions, but got ${result.questions?.length}`);
    }

  } catch (err) {
    console.error("\n❌ Blooket generation test failed!");
    console.error(err.message);
    console.log("==================================================");
  }
}

testBlooket();
