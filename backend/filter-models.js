import dotenv from 'dotenv';
dotenv.config();

async function listGeminiModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.models) {
      const geminiModels = data.models
        .filter(m => m.name.includes("gemini") && m.supportedGenerationMethods.includes("generateContent"))
        .map(m => ({ name: m.name, displayName: m.displayName }));
      console.log("Supported Gemini Generation Models:", JSON.stringify(geminiModels, null, 2));
    } else {
      console.log("No models returned:", data);
    }
  } catch (err) {
    console.error("Failed to list models:", err);
  }
}

listGeminiModels();
