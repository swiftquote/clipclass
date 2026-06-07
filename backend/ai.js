// ClipClass AI Synthesis Layer - Interfaces with Google Gemini API
import dotenv from 'dotenv';

dotenv.config();

async function callGeminiJSON({ systemPrompt, userPrompt, temperature, logPrefix, successLabel }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here' || apiKey === '') {
    throw new Error("Gemini API key is missing or not configured.");
  }

  const candidateModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[${logPrefix}] Attempting synthesis using Gemini model: ${modelName}...`);
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
            temperature
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

      let cleanedText = contentText.trim();
      if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      }

      // Escape raw control characters (newlines, carriage returns, tabs) inside string literals
      cleanedText = cleanedText.replace(/"([^"\\]|\\.)*"/g, (match) => {
        return match
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
      });

      const payload = JSON.parse(cleanedText);
      console.log(`[${logPrefix}] Successfully synthesized ${successLabel} using Gemini model: ${modelName}`);
      return payload;

    } catch (err) {
      console.warn(`[${logPrefix}] Gemini model failed or throttled: ${err.message}. Retrying next candidate...`);
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Generates age-appropriate student worksheets and teacher answer keys using Gemini 1.5 Flash.
 * 
 * @param {Array} timedSegments - Array of { time, text } containing time-annotated transcript segments
 * @param {string} ageGroup - Target age group ("5-7", "8-10", "11-13", "14-16", "17+")
 * @param {string} translationLanguage - Target translation language (e.g. "Spanish", "French", "None")
 * @param {boolean} gamifiedTrivia - Whether to generate an interactive team trivia script
 */
export async function generateWorksheetContent({ timedSegments, ageGroup, translationLanguage = "None", gamifiedTrivia, questionsCount = 10 }) {
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

  try {
    return await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      logPrefix: "AI Layer",
      successLabel: "workbook"
    });
  } catch (err) {
    console.error("Google Gemini API Workbook Generation Error (All Models Failed):", err);
    throw new Error(`AI synthesis failed across all active models. Last error: ${err.message}`);
  }
}

/**
 * Generates structured, pedagogical PowerPoint slide content from transcript segments.
 * 
 * @param {Array} timedSegments - Array of { time, text } containing time-annotated transcript segments
 * @param {string} ageGroup - Target age group ("5-7", "8-10", "11-13", "14-16", "17+")
 * @param {string} theme - Style theme name (e.g. "Default", "Warm Editorial", "Sleek Dark")
 */
export async function generatePowerpointContent({ timedSegments, ageGroup, theme = "Default" }) {
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
        "1. Introduction",
        "2. [First Content Slide Topic Name]",
        "3. [Second Content Slide Topic Name]",
        "4. [Third Content Slide Topic Name]",
        "5. [Fourth Content Slide Topic Name]",
        "6. [Activity 1 Name] (e.g. Multiple Choice Review)",
        "7. [Activity 2 Name] (e.g. True or False Challenge)",
        "8. Exit Ticket (Final Assessment)",
        "9. Summary & Takeaways"
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
      "imageSearchPhrase": "A specific 3-6 word descriptive phrase in English only optimized for Wikimedia Commons. Specify exact diagrams/concepts (e.g. 'sodium chloride ionic bond electron transfer diagram' instead of 'atom diagram'). Avoid covers, portraits, multi-panel charts, generic terms, the term 'illustration', and the slide title itself. For abstract concepts, use a concrete scene/object photograph (e.g. 'satellite television broadcast tower photograph').",
      "visualType": "Specify either 'diagram' (if the slide visual is a labeled diagram, flowchart, step-by-step process, chart, or mathematical illustration) or 'photo' (if the visual requires a real photograph, painting, or map that exists in the world).",
      "visualMethod": "Specify either 'svg' (if the content is logic gates, circuits, truth tables, calculations, step-by-step processes requiring labelled stages, or maths/CS content where accuracy is critical) or 'generate' (if the content is biology, cells, historical events, geography, maps, or rich illustrations).",
      "notes": "Bulleted teacher talking points, explanation context, discussion prompts, and timing cues (e.g. '[Pacing: 2 mins]')."
    },
    {
      "type": "mcq",
      "title": "A clear, question-based title for the multiple choice recall task",
      "bullets": [
        "A) Option A",
        "B) Option B",
        "C) Option C",
        "D) Option D"
      ],
      "correctAnswer": "A) Option A",
      "notes": "Correct Answer: [Option letter] plus brief explanation of the correct choice."
    },
    {
      "type": "true_false",
      "title": "A clear title for the True/False statement review task",
      "bullets": [
        "1. First statement (can be true or false)",
        "2. Second statement (can be true or false)",
        "3. Third statement (can be true or false)",
        "4. Fourth statement (can be true or false)"
      ],
      "correctAnswers": ["True", "False", "True", "False"],
      "notes": "Correct Answers:\n1. True\n2. False\n..."
    },
    {
      "type": "fill_blank",
      "title": "A clear title for the Fill in the Blanks definition task",
      "bullets": [
        "1. A concise sentence with one crucial _____ removed (max 15 words).",
        "2. A second concise sentence with a _____ blank (max 15 words).",
        "3. A third concise sentence with a _____ blank (max 15 words)."
      ],
      "correctAnswers": ["word1", "word2", "word3"],
      "notes": "Correct Answers:\n1. [Word]\n2. [Word]\n3. [Word]"
    },
    {
      "type": "matching",
      "title": "A clear title for the Concept Matching vocabulary task",
      "bullets": [
        "1. Term A  <-->  A. Shuffled definition 1",
        "2. Term B  <-->  B. Shuffled definition 2",
        "3. Term C  <-->  C. Shuffled definition 3",
        "4. Term D  <-->  D. Shuffled definition 4"
      ],
      "correctMatches": ["B", "A", "D", "C"],
      "notes": "Correct Matches:\n1 - B (Term A - Definition A)\n2 - A (Term B - Definition B)..."
    },
    {
      "type": "odd_one_out",
      "title": "A clear title for the Odd One Out categorization task",
      "bullets": [
        "A) Term 1",
        "B) Term 2",
        "C) Term 3 (Odd one out)",
        "D) Term 4"
      ],
      "correctAnswer": "C) Term 3",
      "notes": "Correct Answer: C) Term 3\nExplanation: Why it does not belong in this group."
    },
    {
      "type": "exit_ticket",
      "title": "A clear title for the Exit Ticket review task",
      "bullets": [
        "1. Short open question A",
        "2. Short open question B",
        "3. Short open question C (optional)"
      ],
      "notes": "Answers/Rubric:\n1. [Expected student response]\n2. [Expected student response]"
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
1. Logical Arc: Title -> Objectives -> Agenda -> 4 to 6 Content Slides -> 3 to 5 unique Activity Slides -> Summary Slide.
2. Cognitive Load: Max 1 core idea per slide. Bullet points must be short keywords/phrases (no full paragraphs). Cap bullet points at exactly 4 per slide.
3. Assertion-Evidence Style: For every "content" slide, the header MUST be a full-sentence assertion claim (not a vague topic label like 'Introduction' or 'Starch').
4. Delivery Support: Put the teacher's talking points, discussion prompts, and timing cues strictly in the 'notes' field (which will go to the speaker notes). Keep the slides clean.
5. Alignment: Every content slide must align directly back to the stated learning objectives.
6. Roadmap Slide Formatting:
   - The roadmap/agenda slide must list exactly the items corresponding to the actual slides that follow, in order.
   - Do not invent names of sections or activities that do not correspond to actual slides.
   - Include: One item per content slide (using its actual topic), one item for each activity slide (using its actual activity type name), and one item for the summary.
   - The roadmap items must be formatted as a numbered list (e.g. "1. Introduction", "2. Photosynthesis Process", "3. Multiple Choice Review", "4. Exit Ticket", "5. Summary").
7. Mixed Activity Section:
   - Select between 3 and 5 activity slides to put in the activity section.
   - Intelligently choose the activity types from the available list ("mcq", "true_false", "fill_blank", "matching", "odd_one_out", "exit_ticket") that best fit the lesson content.
   - Must include at least one "mcq" activity slide.
   - Must end with an "exit_ticket" activity slide.
   - Never repeat the same activity type twice in a deck (each activity slide must be of a unique type).
   - For the "fill_blank" activity, generate a minimum of 3 and a maximum of 4 fill-in-the-blank sentences. Each sentence must be concise, with a maximum of 15 words.
   - For all activity slides (except exit_ticket), you MUST populate the corresponding correct answer field ("correctAnswer", "correctAnswers", or "correctMatches") exactly as defined in the slide object examples.
   - Ensure the correct answers/solutions are always provided in the "notes" field for every activity slide.
8. Image Search Phrase Guidelines:
   For each content slide, generate an "imageSearchPhrase" to find a relevant educational image on Wikimedia Commons:
   - Write it as a specific 3-6 word descriptive phrase, NOT comma-separated tags.
   - Always generate phrases in English only. Never include foreign-language terms even if the topic originates from another language.
   - Optimise for Wikimedia Commons search — think about what an educator or textbook author would have uploaded.
   - Be specific enough that only ONE type of diagram could result. Bad: "atom diagram". Good: "helium atom nucleus electrons labeled diagram". Bad: "carbon structure". Good: "carbon atomic number 6 protons diagram".
   - For MATHS and SCIENCE slides: always include the specific subject name + the exact concept being shown + "diagram" or "labeled" (e.g. "sodium chloride ionic bond electron transfer diagram", "hydrogen isotopes protium deuterium tritium diagram", "Pythagoras theorem right triangle labeled").
   - For HISTORY and SOCIAL STUDIES slides: include the medium (e.g. "Constitutional Convention 1787 painting", "World War 2 soldiers photograph").
   - For GEOGRAPHY slides: include "map" where relevant (e.g. "United States electoral college map").
   - For TECHNOLOGY slides: include "diagram" or "schematic" (e.g. "CPU processor architecture diagram", "input process output flowchart").
   - For ABSTRACT or CONCEPTUAL slides (theories, ethics, influence, literacy, democracy, culture): do NOT describe the concept itself. Instead, identify a concrete real-world object or scene that represents it (e.g. instead of "soft power media influence" use "satellite television broadcast tower photograph"; instead of "critical media literacy" use "person reading newspaper critical thinking photograph").
   - NEVER use the word "illustration" as a medium in any rule (use "diagram" for STEM/technology and "photograph" for real-world scenes/mediums, as "illustration" returns decorative artwork rather than educational visuals on Wikimedia).
   - Avoid phrases that return textbook cover images, portrait photos of scientists, or multi-panel reference charts. If the slide is about a single concept, the phrase should return a single focused diagram, not a reference sheet.
   - NEVER generate a phrase that would return a generic stock photo (avoid: "people working", "student learning", "technology concept").
   - NEVER use the slide title as the phrase — be more specific about the actual visual needed.
7. Visual Type Selection Guidelines:
   For each content slide, output a "visualType" field:
   - "diagram" — the visual is a labeled diagram, flowchart, step-by-step process, chart, or mathematical illustration (e.g. binary conversion steps, atom structure, circuit diagram, flowchart, Pythagoras triangle, pros/cons comparison, timeline).
   - "photo" — the visual requires a real photograph, painting, or map that exists in the world (e.g. historical events, real people, places, maps, scientific photographs, artworks).
8. Visual Method Selection Guidelines:
   For each content slide, output a "visualMethod" field:
   - "svg" — when the slide contains logic gates, circuits, truth tables, calculations, step-by-step processes requiring labelled stages, or maths/CS content where accuracy is critical.
   - "generate" — when the slide contains biology, cells, historical events, geography, maps, or rich illustrations where a visual style adds more value than technical layout accuracy.
9. Output Format: Return ONLY raw, valid JSON. Do not include markdown code block formatting (\`\`\`json) in your actual payload.`;

  const userPrompt = `Generate a structured slide deck for:
- Student Age Group: Ages ${ageGroup}
- Selected Accent Color: ${theme}

Here is the chronological transcript of the educational video:
=== START TRANSCRIPT ===
${formattedTranscript}
=== END TRANSCRIPT ===`;

  try {
    return await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.35,
      logPrefix: "AI Slide Layer",
      successLabel: "slide JSON"
    });
  } catch (err) {
    console.error("Google Gemini API PowerPoint Generation Error (All Models Failed):", err);
    throw new Error(`AI slide synthesis failed across all active models. Last error: ${err.message}`);
  }
}
