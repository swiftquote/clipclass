import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("List Models Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to list models:", err);
  }
}

listModels();
