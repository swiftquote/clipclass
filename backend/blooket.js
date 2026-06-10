// ClipClass Blooket Game Generator - Interfaces with Google Gemini to compile 15 MCQ questions
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generates 15 multiple choice review questions from video transcript segments.
 * 
 * @param {Array} timedSegments - Array of { time, text } containing time-annotated transcript segments
 * @param {string} ageGroup - Target age group ("5-7", "8-10", "11-13", "14-16", "17+")
 */
export async function generateBlooketContent({ timedSegments, ageGroup }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here' || apiKey === '') {
    throw new Error("Gemini API key is missing or not configured in .env. Please configure your GEMINI_API_KEY first.");
  }

  // Format the transcript segments as a readable timeline script for the LLM
  const formattedTranscript = timedSegments
    .map(seg => `[${seg.time}] ${seg.text}`)
    .join('\n');

  // Define age level specifications to direct Gemini
  const ageSpecs = {
    "5-7": "Kindergarten to 1st grade level. Use extremely simple words, short sentences (5-8 words), focus on basic concrete facts (e.g., colors, shapes, animal names). Questions should be extremely clear and direct.",
    "8-10": "Primary/Elementary level. Use simple, clear vocabulary and moderate sentences. Focus on understanding the main ideas, characters, and direct causes.",
    "11-13": "Middle School level. Introduce descriptive vocabulary. Inquire about core conceptual definitions, relationships, and secondary insights.",
    "14-16": "High School level. Expect sophisticated vocabulary, complex subjects, and analytical comprehension.",
    "17+": "Advanced/College level. Use specialized, scholarly vocabulary. Inquire about theoretical implications, structural arguments, and data/assumptions."
  };

  const selectedSpec = ageSpecs[ageGroup] || ageSpecs["8-10"];

  // Formulate the strict system guidance instructions
  const systemPrompt = `You are an elite, pedagogical curriculum design expert specialized in building highly engaging, ready-to-import classroom review game sets for Blooket.
Your task is to analyze the provided YouTube video transcript and synthesize a structured review set of exactly 15 multiple-choice questions tailored precisely for: Target Audience: Ages ${ageGroup} (${selectedSpec}).

You must output a single, valid JSON object following this EXACT structure:
{
  "questions": [
    {
      "question": "A clear, classroom-appropriate question testing a specific fact, cause, definition, or key concept from the transcript. Keep it concise. Max 120 characters.",
      "options": [
        "First choice Option. Keep under 60 characters.",
        "Second choice Option. Keep under 60 characters.",
        "Third choice Option. Keep under 60 characters.",
        "Fourth choice Option. Keep under 60 characters."
      ],
      "correctAnswer": "The exact text of the correct choice matching one of the options in the options list (e.g. if the third choice is correct, copy its exact text here).",
      "timeLimit": 20
    }
  ]
}

CRITICAL RULES FOR CONTENT SYNTHESIS:
1. Exactly 15 Questions: You MUST generate exactly 15 multiple-choice questions. No more, no less.
2. Options Count: Every question must contain exactly 4 option choices inside the "options" array.
3. Correct Answer Matching: The "correctAnswer" string MUST match the text in one of the 4 elements in the "options" array EXACTLY, character-for-character, including casing and spacing.
4. Professional Quality: Questions must be professional, academic, and directly test core conceptual lessons, facts, or definitions taught in the transcript. Do NOT reference the video itself, the speaker, the channel name, timestamps, or video structure in the question or options text (e.g. do NOT ask 'What does the video show at 02:15?', 'What is said at the beginning?', or 'What does the speaker explain?'). Every question must test the subject matter directly (e.g. 'What are the main components of photosynthesis?' instead of 'What does the video say are the main components of photosynthesis?'). Avoid generic or meta-style questions.
5. Time Limits: Set "timeLimit" to 20 for standard questions, or 30 for questions requiring slightly longer thinking time.
6. Output Format: Return ONLY raw, valid JSON. Do not include markdown code block formatting (\`\`\`json) in your actual payload. Check that all double quotes are escaped correctly in fields.`;

  const userPrompt = `Generate the Blooket structured game kit based on the following input parameters:
- Student Age Group: Ages ${ageGroup}

Here is the chronological transcript of the educational video:
=== START TRANSCRIPT ===
${formattedTranscript}
=== END TRANSCRIPT ===`;

  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[Blooket Layer] Attempting synthesis using model: ${modelName}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // Enforce 25-second timeout

      let response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
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
      } finally {
        clearTimeout(timeoutId);
      }

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
      console.log(`[Blooket Layer] Successfully synthesized Blooket dataset using model: ${modelName}`);
      return payload;

    } catch (err) {
      console.warn(`[Blooket Layer] Model ${modelName} failed or throttled: ${err.message}. Retrying next candidate...`);
      lastError = err;
    }
  }

  console.error("Google Gemini API Blooket Generation Error (All Models Failed):", lastError);
  throw new Error(`Blooket AI synthesis failed across all active models. Last error: ${lastError.message}`);
}
