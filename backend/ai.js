// ClipClass AI Synthesis Layer - Interfaces with Google Gemini API using native JSON output
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generates age-appropriate student worksheets and teacher answer keys using Gemini 1.5 Flash.
 * 
 * @param {Array} timedSegments - Array of { time, text } containing time-annotated transcript segments
 * @param {string} ageGroup - Target age group ("5-7", "8-10", "11-13", "14-16", "17+")
 * @param {string} translationLanguage - Target translation language (e.g. "Spanish", "French", "None")
 * @param {boolean} gamifiedTrivia - Whether to generate an interactive team trivia script
 */
export async function generateWorksheetContent({ timedSegments, ageGroup, translationLanguage = "None", gamifiedTrivia }) {
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
    "5-7": "Kindergarten to 1st grade level. Use extremely simple words, short sentences (5-8 words), focus on basic concrete facts (e.g., colors, shapes, animal names). Workbook is visual-oriented; questions should ask 'what did you see' or 'what happened next'.",
    "8-10": "Primary/Elementary level. Use simple, clear vocabulary and moderate sentences. Focus on understanding the main ideas, characters, and direct causes. Questions should test chronological recall.",
    "11-13": "Middle School level. Introduce descriptive vocabulary and compound sentences. Inquire about core conceptual definitions, relationships, and secondary insights. Questions should start pushing for basic 'why' reasoning.",
    "14-16": "High School level. Expect sophisticated vocabulary, complex subjects, and analytical reading comprehension. Inquire about underlying themes, evidence-backed conclusions, and critical observations.",
    "17+": "Advanced/College level. Use specialized, scholarly vocabulary. Inquire about theoretical implications, structural arguments, analysis of data/assumptions, and high-order evaluation."
  };

  const selectedSpec = ageSpecs[ageGroup] || ageSpecs["8-10"];

  // Formulate the strict system guidance instructions
  const systemPrompt = `You are an elite, pedagogical curriculum design expert specialized in building highly engaging, ready-to-print student worksheets for global educators.
Your task is to analyze the provided chronological YouTube video transcript and synthesize a structured, top-tier classroom workbook tailored precisely for: Target Audience: ${ageGroup} (${selectedSpec}).

You must output a single, valid JSON object following this EXACT structure:
{
  "summary": "A clean 3-sentence student summary summarizing the core learning takeaways. Write at the target age group's exact reading comprehension level.",
  "translatedSummary": "A clean 3-sentence translation of the summary into the selected language (e.g., Spanish, French, German, Mandarin Chinese, Arabic, Hindi, Vietnamese). Only populate this field if translationLanguage is NOT 'None'. If translationLanguage is 'None', output an empty string.",
  "questions": [
    {
      "number": 1,
      "timestamp": "MM:SS",
      "question": "A student active-listening question. Must correspond chronologically to this timeline of the video.",
      "studentAnswerLines": 2
    }
  ],
  "teacherAnswers": [
    {
      "number": 1,
      "timestamp": "MM:SS",
      "question": "The matching active-listening question text.",
      "answer": "A detailed, complete, and highly educational teacher model answer customized to the selected student age level."
    }
  ],
  "triviaScript": {
    "gameTitle": "A creative title for the gamified classroom trivia review.",
    "instructions": "Short, highly engaging rule script for the teacher to read aloud to standard teams (e.g. 'Split into teams. You have 30 seconds...').",
    "rounds": [
      {
        "round": 1,
        "question": "A fun, conceptual trivia question reviewing the video.",
        "options": ["A) Choice A", "B) Choice B", "C) Choice C", "D) Choice D"],
        "answer": "Correct Option letter (e.g., A, B, C, or D) plus brief rationale explanation."
      }
    ]
  }
}

CRITICAL RULES FOR CONTENT SYNTHESIS:
1. Chronological Timeline: You MUST generate exactly 10 active-listening questions and matching teacher answers, ordered chronologically according to the video timeline (from start to finish). The "timestamp" field must exactly match the timestamp in the transcript where the answer is explained (e.g., 01:15, 03:40).
2. Exam-Style Question Quality: All 10 questions must be professional, "exam style" academic questions testing specific conceptual details, core factual lessons, or theoretical mechanics explained in the transcript. Avoid generic, useless, or meta-style questions (such as "What is the purpose of this video?", "Who is the speaker?", "What is the title of the video?"). Every question must focus strictly on the educational content being taught in the transcript.
3. Translation/ELL Support: If translationLanguage is NOT 'None', you MUST populate the 'translatedSummary' field with a flawless translation in that exact requested language (e.g., Spanish, French, German, Mandarin, Arabic, Hindi, or Vietnamese). If translationLanguage is 'None', leave it as an empty string.
4. Trivia Script: If gamifiedTrivia is true, you MUST populate the 'triviaScript' object with exactly 5 rounds of multiple-choice team trivia questions. If false, output an empty triviaScript structure (empty fields/empty rounds array).
5. Output Format: Return ONLY raw, valid JSON. Do not include markdown code block formatting (\`\`\`json) in your actual payload. Check that all double quotes are escaped correctly in fields.`;

  const userPrompt = `Generate the structured classroom kit based on the following input parameters:
- Student Age Group: Ages ${ageGroup}
- Target Translation Language: ${translationLanguage}
- Gamified Trivia Script Enabled: ${gamifiedTrivia}

Here is the chronological transcript of the educational video:
=== START TRANSCRIPT ===
${formattedTranscript}
=== END TRANSCRIPT ===`;

  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[AI Layer] Attempting worksheet synthesis using model: ${modelName}...`);
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
            temperature: 0.3
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
      console.log(`[AI Layer] Successfully synthesized workbook using model: ${modelName}`);
      return payload;

    } catch (err) {
      console.warn(`[AI Layer] Model ${modelName} failed or throttled: ${err.message}. Retrying next candidate...`);
      lastError = err;
    }
  }

  // If all models failed, throw the final error
  console.error("Google Gemini API Workbook Generation Error (All Models Failed):", lastError);
  throw new Error(`AI synthesis failed across all active models. Last error: ${lastError.message}`);
}
