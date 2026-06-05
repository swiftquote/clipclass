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
export async function generateWorksheetContent({ timedSegments, ageGroup, translationLanguage = "None", gamifiedTrivia, questionsCount = 10 }) {
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

  const questionVarietyInstruction = `generate exactly ${questionsCount} active-listening questions and matching teacher answers, ordered chronologically according to the video timeline (from start to finish). The "timestamp" field must exactly match the timestamp in the transcript where the answer is explained (e.g., 01:15, 03:40).
   All questions must be open-ended active-listening questions (testing understanding and chronological recall of facts/concepts taught in the video). Set "studentAnswerLines" to 2 or 3.`;

  // Formulate the strict system guidance instructions
  const systemPrompt = `You are an elite, pedagogical curriculum design expert specialized in building highly engaging, ready-to-print student worksheets for global educators.
Your task is to analyze the provided chronological YouTube video transcript and synthesize a structured, top-tier classroom workbook tailored precisely for: Target Audience: ${ageGroup} (${selectedSpec}).

You must output a single, valid JSON object following this EXACT structure:
{
  "summary": "A clean 3-sentence student summary summarizing the core learning takeaways. Write at the target age group's exact reading comprehension level. If translationLanguage is NOT 'None', write this summary directly in the selected language.",
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
1. Chronological Timeline and Question Variety: You MUST ${questionVarietyInstruction}
2. Exam-Style Question Quality: All questions must be professional, "exam style" academic questions testing specific conceptual details, core factual lessons, or theoretical mechanics explained in the transcript. Do NOT reference the video itself, the speaker, the channel name, timestamps, or video structure in the question or answer text (e.g. do NOT ask 'What does the video show at 02:15?', 'What is said at the beginning?', or 'What does the speaker explain?'). Every question must test the subject matter directly (e.g. 'What are the main components of photosynthesis?' instead of 'What does the video say are the main components of photosynthesis?'). Avoid generic, useless, or meta-style questions (such as "What is the purpose of this video?", "Who is the speaker?", "What is the title of the video?"). Every question must focus strictly on the educational content being taught in the transcript.
3. Full Worksheet Translation: If translationLanguage is NOT 'None', you MUST generate ALL written text fields of the entire worksheet (including the 'summary', the question texts in 'questions' and 'teacherAnswers', the answer texts in 'teacherAnswers', and the entire 'triviaScript' fields: gameTitle, instructions, round questions, options, and answer/rationale) natively in that exact requested language (e.g., Spanish, French, German, Mandarin, Arabic, Hindi, or Vietnamese). Do not keep them in English. If translationLanguage is 'None', generate everything in English.
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

/**
 * Generates structured, pedagogical PowerPoint slide content from transcript segments.
 * 
 * @param {Array} timedSegments - Array of { time, text } containing time-annotated transcript segments
 * @param {string} ageGroup - Target age group ("5-7", "8-10", "11-13", "14-16", "17+")
 * @param {string} theme - Style theme name (e.g. "Default", "Warm Editorial", "Sleek Dark")
 */
export async function generatePowerpointContent({ timedSegments, ageGroup, theme = "Default" }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here' || apiKey === '') {
    throw new Error("Gemini API key is missing or not configured.");
  }

  const formattedTranscript = timedSegments
    .map(seg => `[${seg.time}] ${seg.text}`)
    .join('\n');

  const ageSpecs = {
    "5-7": "Kindergarten/1st Grade. Extremely simple vocabulary, 5-8 word sentences, focus on concrete facts (animals, shapes). Key concepts must be highly visual.",
    "8-10": "Elementary School. Clear and direct vocabulary, simple concepts. Focus on chronological narrative and basic causes.",
    "11-13": "Middle School. Descriptive vocabulary, definitions, relationships, and basic 'why' reasoning.",
    "14-16": "High School. Analytical comprehension, complex topics, and conceptual relationships.",
    "17+": "College/Adult. Academic terminology, theoretical frameworks, data analysis, and advanced arguments."
  };

  const selectedSpec = ageSpecs[ageGroup] || ageSpecs["8-10"];

  const systemPrompt = `You are a world-class pedagogical curriculum developer and presentation design specialist. 
Your task is to analyze the provided YouTube transcript and synthesize a structured, highly effective, ready-to-build classroom slide deck JSON representation.
The target audience is students in the age group: ${ageGroup} (${selectedSpec}).

You must output a single, valid JSON object following this EXACT structure:
{
  "slides": [
    {
      "type": "title",
      "title": "Title of the Lesson (Highly engaging & age-appropriate)",
      "subtitle": "Grade/Level and Subject"
    },
    {
      "type": "objectives",
      "title": "Learning Objectives",
      "bullets": [
        "Objective 1: Active verb phrased (e.g. Explain, Compare, Analyze, Calculate...)",
        "Objective 2: Active verb phrased"
      ]
    },
    {
      "type": "agenda",
      "title": "Lesson Roadmap",
      "bullets": [
        "1. Hook & Warmup",
        "2. Key Concepts & Factual Lessons",
        "3. Real-world Examples",
        "4. Interactive Challenge",
        "5. Consolidation & Takeaways"
      ]
    },
    {
      "type": "content",
      "title": "Assertion Header: A complete, single-sentence claim summarizing the core concept of this slide (e.g., 'Plants store glucose as starch to use for energy later.')",
      "bullets": [
        "First key point: Short keyword or phrase (max 8 words)",
        "Second key point: Short keyword or phrase",
        "Third key point: Short keyword or phrase",
        "Fourth key point (optional): Short keyword or phrase"
      ],
      "visualDescription": "Detailed visual description of a clean, content-relevant diagram, illustration, or visual model that proves the assertion header (e.g., 'A simple diagram of a leaf showing glucose molecules bonding into a long starch chain'). No generic stock art/clipart.",
      "imageSearchPhrase": "A specific, descriptive search phrase to fetch a relevant photographic image or historical painting from Wikimedia Commons or Unsplash (e.g., 'Constitutional Convention 1787 painting', 'United States Senate chamber photo', or 'green leaf photosynthesis cellular diagram'). Do not use generic, loose keywords.",
      "notes": "Bulleted teacher talking points, explanation context, discussion prompts, and timing cues (e.g. '[Pacing: 2 mins]')."
    },
    {
      "type": "interactive",
      "title": "Discussion Prompt or Question",
      "question": "An active review question matching the slide content.",
      "options": ["A) Choice A", "B) Choice B", "C) Choice C", "D) Choice D"],
      "correctAnswer": "A) Choice A",
      "notes": "Teacher notes directing the check for understanding."
    },
    {
      "type": "summary",
      "title": "Summary of Takeaways",
      "bullets": [
        "First major take-home concept (short phrase)",
        "Second major take-home concept (short phrase)",
        "Third major take-home concept (short phrase)"
      ],
      "notes": "Teacher directions to close and consolidate the lesson."
    }
  ]
}

CRITICAL RULES FOR CONTENT SYNTHESIS:
1. Logical Arc: Title -> Objectives -> Agenda -> 4 to 6 Content Slides -> 1 Interactive Check Slide -> Summary Slide.
2. Cognitive Load: Max 1 core idea per slide. Bullet points must be short keywords/phrases (no full paragraphs). Cap bullet points at exactly 4 per slide.
3. Assertion-Evidence Style: For every "content" slide, the header MUST be a full-sentence assertion claim (not a vague topic label like 'Introduction' or 'Starch').
4. Delivery Support: Put the teacher's talking points, discussion prompts, and timing cues strictly in the 'notes' field (which will go to the speaker notes). Keep the slides clean.
5. Alignment: Every content slide must align directly back to the stated learning objectives.
6. Output Format: Return ONLY raw, valid JSON. Do not include markdown code block formatting (\`\`\`json) in your actual payload.`;

  const userPrompt = `Generate a structured slide deck for:
- Student Age Group: Ages ${ageGroup}
- Selected Accent Color: ${theme}

Here is the chronological transcript of the educational video:
=== START TRANSCRIPT ===
${formattedTranscript}
=== END TRANSCRIPT ===`;

  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[AI Slide Layer] Attempting PPTX synthesis using model: ${modelName}...`);
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
      console.log(`[AI Slide Layer] Successfully synthesized slide JSON using model: ${modelName}`);
      return payload;

    } catch (err) {
      console.warn(`[AI Slide Layer] Model ${modelName} failed or throttled: ${err.message}. Retrying next candidate...`);
      lastError = err;
    }
  }

  console.error("Google Gemini API PowerPoint Generation Error (All Models Failed):", lastError);
  throw new Error(`AI slide synthesis failed across all active models. Last error: ${lastError.message}`);
}
