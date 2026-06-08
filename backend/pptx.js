import pptxgen from 'pptxgenjs';

/**
 * Generates an image using Google Imagen and returns it as a Base64 data URI.
 *
 * @param {string} visualDescription - Slide image description text
 * @returns {Promise<string|null>} Base64 image data URI string, or null on failure
 */
async function generateImageFromImagen(visualDescription) {
  if (!visualDescription) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Image Generator] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout

  try {
    const cleanDescription = visualDescription.trim().replace(/[.,;:!?]+$/, "");
    const finalPrompt = `A clean, professional presentation slide illustration of: ${cleanDescription}. Clear visual metaphor, high quality. Strictly no text, no labels, no words, no characters, no typography, no letters, no numbers. Pure visual design without annotations.`;
    console.log(`[Image Generator] Fetching image from Imagen 4.0 for: "${finalPrompt.substring(0, 80)}..."`);
    const response = await fetch(url, {
      signal: controller.signal,
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        instances: [{ prompt: finalPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          personGeneration: "dont_allow"
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Imagen API responded with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const image = data.predictions?.[0];
    if (!image || !image.bytesBase64Encoded) {
      throw new Error("No image predictions returned from Imagen API.");
    }

    return `data:${image.mimeType};base64,${image.bytesBase64Encoded}`;
  } catch (err) {
    console.error("[Image Generator] Imagen image generation failed:", err.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generates an SVG diagram using Google Gemini 2.5 Flash and returns it as a Base64 data URI.
 *
 * @param {string} title - Slide title
 * @param {string} visualDescription - Visual diagram description
 * @returns {Promise<string|null>} Base64 SVG data URI string, or null on failure
 */
async function generateSvgFromGemini(title, visualDescription) {
  if (!title && !visualDescription) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[SVG Generator] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout

  try {
    const systemPrompt = `You are a professional presentation graphic designer and software engineer.
Your task is to generate a clean, modern, and mathematically/technically accurate SVG diagram.
Rules:
1. Output ONLY valid, raw, well-formatted SVG code.
2. Start with <svg> and end with </svg>.
3. Do NOT wrap the output in markdown block code formatting (like \`\`\`xml or \`\`\`svg) or any other text. Return ONLY the SVG.
4. Ensure the SVG has a viewBox="0 0 680 400" and uses a white background.
5. All text labels must be large and readable (minimum 16px font-size) using a clean sans-serif font-family (e.g. System-UI, Inter, Arial).
6. Focus on ONE clear visual element only.`;

    const userPrompt = `Generate a clean educational SVG diagram of: ${visualDescription || title || ""}. Focus on ONE clear visual element only. Large readable labels, minimum 16px text, white background, viewBox 680x400.`;

    console.log(`[SVG Generator] Generating SVG using Gemini 2.5 Flash for: "${title}"...`);

    const response = await fetch(url, {
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
          temperature: 0.2
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API responded with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!contentText) {
      throw new Error("No SVG content returned from Gemini API.");
    }

    let cleanedText = contentText.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:xml|svg)?\n?/i, "").replace(/\n?```$/, "").trim();
    }

    if (!cleanedText.startsWith("<svg")) {
      throw new Error("Returned content does not appear to be a valid SVG element.");
    }

    // Convert raw SVG string to Base64 data URI
    const base64Data = Buffer.from(cleanedText).toString('base64');
    return `data:image/svg+xml;base64,${base64Data}`;

  } catch (err) {
    console.error("[SVG Generator] SVG generation failed:", err.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compiles a structured slides JSON object into a styled PPTX file buffer.
 * Enforces global off-white background, near-black text, and a clean sans-serif (Inter).
 * 
 * @param {Object} slidesJSON - The JSON structure containing slide definitions
 * @param {string} accentName - Accent color choice (e.g. "Cobalt Blue", "Emerald Green", "Terracotta Rust", "Royal Purple", "Crimson Red")
 * @returns {Promise<Buffer>} The generated PPTX file buffer
 */
export async function compilePresentation(slidesJSON, accentName = "Cobalt Blue") {
  const pptx = new pptxgen();
  
  // Set presentation layout to widescreen (16:9)
  pptx.layout = 'LAYOUT_16x9';

  // Enforce global styling guidelines
  const BG_COLOR = "FAFAF8";      // Soft off-white (less projector glare)
  const TEXT_COLOR = "1A1A1A";    // Near-black (high contrast)
  const FONT_FAMILY = "Inter";    // Unified web-safe clean sans-serif

  // Accent Colors Slot (tinted per subject/branding)
  const accents = {
    "Cobalt Blue": "2563EB",
    "Emerald Green": "10B981",
    "Terracotta Rust": "C2410C",
    "Royal Purple": "7C3AED",
    "Crimson Red": "DC2626"
  };

  const accentHex = accents[accentName] || accents["Cobalt Blue"];

  const slides = slidesJSON.slides || [];

  // Generate all slide visuals (both SVG diagrams and Imagen images) concurrently in parallel.
  // Since we are using the paid Gemini API tier, rate-limiting delays are not required,
  // and concurrent execution prevents the client-side request timeout (60s).
  const visualPromises = [];
  for (const s of slides) {
    if (s.type === 'content') {
      if (s.visualMethod === 'svg') {
        visualPromises.push((async () => {
          s.imageBase64 = await generateSvgFromGemini(s.title, s.visualDescription);
        })());
      } else {
        visualPromises.push((async () => {
          s.imageBase64 = await generateImageFromImagen(s.visualDescription);
        })());
      }
    }
  }
  await Promise.all(visualPromises);

  const renderSingleSlide = (slide, s, highlightAnswer) => {
    // Set global off-white background
    slide.background = { fill: BG_COLOR };

    // Attach speaker notes
    if (s.notes) {
      slide.addNotes(s.notes);
    }

    switch (s.type) {
      case 'title':
        // Big Title (38pt, clean sans-serif, accent color)
        slide.addText(s.title || "Lesson Topic", {
          x: 0.8,
          y: 1.5,
          w: 8.4,
          h: 1.5,
          fontSize: 38,
          bold: true,
          color: accentHex,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink'
        });

        // Subtitle (22pt, near-black text)
        slide.addText(s.subtitle || "Subject & Level", {
          x: 0.8,
          y: 3.2,
          w: 8.4,
          h: 0.8,
          fontSize: 22,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'top'
        });

        // Decorative Accent Line
        slide.addShape(pptx.shapes.RECTANGLE, {
          x: 0.8,
          y: 3.0,
          w: 3.0,
          h: 0.08,
          fill: { color: accentHex }
        });
        break;

      case 'objectives':
        // Section Header (38pt, bold, accent color)
        slide.addText(s.title || "Learning Objectives", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 38,
          bold: true,
          color: accentHex,
          fontFace: FONT_FAMILY,
          fit: 'shrink'
        });

        // Objective items (24pt, near-black, bulleted)
        if (s.bullets && s.bullets.length > 0) {
          const listItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, lineSpacing: 36 }
          }));

          slide.addText(listItems, {
            x: 0.8,
            y: 1.6,
            w: 8.4,
            h: 3.2,
            valign: 'top',
            fit: 'shrink'
          });
        }
        break;

      case 'agenda':
        // Section Header (38pt, bold, near-black or accent)
        slide.addText(s.title || "Lesson Roadmap", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 38,
          bold: true,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          fit: 'shrink'
        });

        // Agenda items (22pt, near-black, bulleted)
        if (s.bullets && s.bullets.length > 0) {
          const listItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, lineSpacing: 32, breakLine: true }
          }));

          slide.addText(listItems, {
            x: 0.8,
            y: 1.5,
            w: 8.4,
            h: 3.2,
            valign: 'top'
          });
        }
        break;

      case 'content':
        // Assertion Header (a full-sentence claim, 26pt, bold, near-black)
        const headerText = s.title || "";
        let headerFontSize = 26;
        if (headerText.length > 120) {
          headerFontSize = 18;
        } else if (headerText.length > 80) {
          headerFontSize = 22;
        }

        slide.addText(headerText, {
          x: 0.6,
          y: 0.3,
          w: 8.8,
          h: 1.1,
          fontSize: headerFontSize,
          bold: true,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink'
        });

        // Split Layout: Bullets on Left (24pt), Visual Evidence Card on Right
        if (s.bullets && s.bullets.length > 0) {
          const contentItems = s.bullets.slice(0, 4).map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, lineSpacing: 34 }
          }));

          slide.addText(contentItems, {
            x: 0.6,
            y: 1.4,
            w: 4.2,
            h: 3.6,
            valign: 'top'
          });
        }

        if (s.imageBase64) {
          // 1. Draw a white background placeholder card (fills empty space if contain size has borders)
          slide.addShape(pptx.shapes.RECTANGLE, {
            x: 5.1,
            y: 1.4,
            w: 4.3,
            h: 2.7,
            fill: { color: "FFFFFF" }
          });

          // 2. Render the actual photographic image using 'contain' sizing
          slide.addImage({
            data: s.imageBase64,
            x: 5.1,
            y: 1.4,
            w: 4.3,
            h: 2.7,
            sizing: { type: 'contain', w: 4.3, h: 2.7 }
          });
        } else {
          // Right Column: Fallback Native Diagram Card (when image fetch fails)
          // 1. Draw card background rounded rectangle
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 5.1,
            y: 1.4,
            w: 4.3,
            h: 3.6,
            fill: { color: "F1F5F9" }, // Slate-100 card fill
            line: { color: accentHex, width: 2 }
          });

          // 2. Draw subtle grid backdrop (6 dashed lines in Slate-200)
          for (let i = 1; i <= 3; i++) {
            // Vertical grid line
            slide.addShape(pptx.shapes.LINE, {
              x: 5.1 + (i * 4.3) / 4,
              y: 1.4,
              w: 0,
              h: 3.6,
              line: { color: "E2E8F0", width: 1, dashType: 'dash' }
            });
            // Horizontal grid line
            slide.addShape(pptx.shapes.LINE, {
              x: 5.1,
              y: 1.4 + (i * 3.6) / 4,
              w: 4.3,
              h: 0,
              line: { color: "E2E8F0", width: 1, dashType: 'dash' }
            });
          }

          // 3. Draw connecting lines between nodes
          slide.addShape(pptx.shapes.LINE, {
            x: 6.1,
            y: 2.35,
            w: 0.8,
            h: 0,
            line: { color: accentHex, width: 3 }
          });
          slide.addShape(pptx.shapes.LINE, {
            x: 7.6,
            y: 2.35,
            w: 0.8,
            h: 0,
            line: { color: accentHex, width: 3 }
          });

          // 4. Draw Node 1 ("In")
          slide.addShape(pptx.shapes.OVAL, {
            x: 5.4,
            y: 2.0,
            w: 0.7,
            h: 0.7,
            fill: { color: "FFFFFF" },
            line: { color: accentHex, width: 2 }
          });
          slide.addText("In", {
            x: 5.4,
            y: 2.0,
            w: 0.7,
            h: 0.7,
            fontSize: 12,
            bold: true,
            color: accentHex,
            fontFace: FONT_FAMILY,
            align: 'center',
            valign: 'middle'
          });

          // 5. Draw Node 2 ("Process")
          slide.addShape(pptx.shapes.OVAL, {
            x: 6.9,
            y: 2.0,
            w: 0.7,
            h: 0.7,
            fill: { color: accentHex }
          });
          slide.addText("Process", {
            x: 6.7,
            y: 2.0,
            w: 1.1,
            h: 0.7,
            fontSize: 9,
            bold: true,
            color: "FFFFFF",
            fontFace: FONT_FAMILY,
            align: 'center',
            valign: 'middle'
          });

          // 6. Draw Node 3 ("✓")
          slide.addShape(pptx.shapes.OVAL, {
            x: 8.4,
            y: 2.0,
            w: 0.7,
            h: 0.7,
            fill: { color: "FFFFFF" },
            line: { color: accentHex, width: 2 }
          });
          slide.addText("✓", {
            x: 8.4,
            y: 2.0,
            w: 0.7,
            h: 0.7,
            fontSize: 16,
            bold: true,
            color: accentHex,
            fontFace: FONT_FAMILY,
            align: 'center',
            valign: 'middle'
          });

          // 7. Place Title / Central Concept below nodes
          slide.addText([
            { text: (s.title || "Concept Flow"), options: { bold: true, fontSize: 12, color: TEXT_COLOR, fontFace: FONT_FAMILY } }
          ], {
            x: 5.3,
            y: 2.9,
            w: 3.9,
            h: 1.9,
            align: 'center',
            valign: 'top'
          });
        }
        break;

      case 'mcq': {
        // Activity Header (max 25% height, 24pt, normal black text)
        const titleText = highlightAnswer ? `${s.title || "Multiple Choice"} (Answer)` : (s.title || "Multiple Choice");
        slide.addText(titleText, {
          x: 0.8,
          y: 0.4,
          w: 11.7,
          h: 1.2,
          fontSize: 24,
          bold: false,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink',
          wrap: true
        });

        if (s.bullets && s.bullets.length > 0) {
          const rowHeight = 0.7;
          const spacing = 0.15;
          s.bullets.slice(0, 4).forEach((opt, idx) => {
            const isCorrect = highlightAnswer && s.correctAnswer && (
              opt.trim().startsWith(s.correctAnswer.trim()) ||
              s.correctAnswer.trim().startsWith(opt.trim().substring(0, 2)) ||
              opt.trim() === s.correctAnswer.trim()
            );
            const yPos = 1.8 + (idx * (rowHeight + spacing));

            // Option background card
            slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
              x: 0.8,
              y: yPos,
              w: 11.7,
              h: rowHeight,
              fill: { color: isCorrect ? "F1F5F9" : BG_COLOR },
              line: { color: isCorrect ? accentHex : "E2E8F0", width: isCorrect ? 2 : 1 }
            });

            // Option text
            slide.addText(isCorrect ? `${opt}  ← [ CORRECT ANSWER ]` : opt, {
              x: 1.1,
              y: yPos,
              w: 11.1,
              h: rowHeight,
              fontSize: 18,
              bold: !!isCorrect,
              color: isCorrect ? accentHex : TEXT_COLOR,
              fontFace: FONT_FAMILY,
              valign: 'middle',
              wrap: true
            });
          });
        }
        break;
      }

      case 'true_false': {
        const titleText = highlightAnswer ? `${s.title || "True or False"} (Answer)` : (s.title || "True or False");
        slide.addText(titleText, {
          x: 0.8,
          y: 0.4,
          w: 11.7,
          h: 1.2,
          fontSize: 24,
          bold: false,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink',
          wrap: true
        });

        if (s.bullets && s.bullets.length > 0) {
          // Calculate font size dynamically based on the longest statement + answer label length
          let maxLen = 0;
          s.bullets.forEach((b, idx) => {
            const ans = s.correctAnswers && s.correctAnswers[idx];
            const labelLength = ans ? ans.length + 8 : 0;
            const totalLen = b.length + labelLength;
            if (totalLen > maxLen) {
              maxLen = totalLen;
            }
          });

          let fontSize = 22;
          if (maxLen > 110) {
            fontSize = 12;
          } else if (maxLen > 90) {
            fontSize = 14;
          } else if (maxLen > 75) {
            fontSize = 16;
          } else if (maxLen > 60) {
            fontSize = 18;
          }

          const listItems = [];
          s.bullets.forEach((b, idx) => {
            const ans = s.correctAnswers && s.correctAnswers[idx];
            if (highlightAnswer && ans) {
              const ansColor = ans.toLowerCase().includes("true") ? accentHex : "C2410C";
              listItems.push({
                text: b + "  →  ",
                options: { fontSize: fontSize, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false }
              });
              listItems.push({
                text: `[ ${ans} ]`,
                options: { fontSize: fontSize, fontFace: FONT_FAMILY, color: ansColor, bold: true, bullet: false, breakLine: true }
              });
            } else {
              listItems.push({
                text: b,
                options: { fontSize: fontSize, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, breakLine: true }
              });
            }
          });

          slide.addText(listItems, {
            x: 0.8,
            y: 1.8,
            w: 11.7,
            h: 5.0,
            valign: 'top',
            fit: 'shrink',
            wrap: true
          });
        }
        break;
      }

      case 'fill_blank': {
        const titleText = highlightAnswer ? `${s.title || "Fill in the Blanks"} (Answer)` : (s.title || "Fill in the Blanks");
        slide.addText(titleText, {
          x: 0.8,
          y: 0.4,
          w: 11.7,
          h: 1.2,
          fontSize: 24,
          bold: false,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink',
          wrap: true
        });

        if (s.bullets && s.bullets.length > 0) {
          const listItems = [];
          s.bullets.forEach((b, idx) => {
            const ans = s.correctAnswers && s.correctAnswers[idx];
            if (highlightAnswer && ans) {
              const parts = b.split(/__+/);
              if (parts.length >= 2) {
                listItems.push({
                  text: parts[0],
                  options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false }
                });
                listItems.push({
                  text: `[ ${ans} ]`,
                  options: { fontSize: 22, fontFace: FONT_FAMILY, color: accentHex, bold: true, bullet: false }
                });
                listItems.push({
                  text: parts.slice(1).join(""),
                  options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, breakLine: true }
                });
              } else {
                listItems.push({
                  text: b + `  [ ${ans} ]`,
                  options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, breakLine: true }
                });
              }
            } else {
              listItems.push({
                text: b,
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, breakLine: true }
              });
            }
          });

          slide.addText(listItems, {
            x: 0.8,
            y: 1.8,
            w: 11.7,
            h: 5.0,
            valign: 'top',
            fit: 'shrink',
            wrap: true
          });
        }
        break;
      }

      case 'matching': {
        const titleText = highlightAnswer ? `${s.title || "Concept Matching"} (Answer)` : (s.title || "Concept Matching");
        slide.addText(titleText, {
          x: 0.8,
          y: 0.4,
          w: 11.7,
          h: 1.2,
          fontSize: 24,
          bold: false,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink',
          wrap: true
        });

        const leftTerms = [];
        const rightDefs = [];

        if (s.bullets && s.bullets.length > 0) {
          s.bullets.forEach(b => {
            const parts = b.split(/<-->/);
            if (parts.length >= 2) {
              leftTerms.push(parts[0].trim());
              rightDefs.push(parts[1].trim());
            } else {
              leftTerms.push(b);
            }
          });
        }

        // Render Left Column
        if (leftTerms.length > 0) {
          const leftItems = [];
          leftTerms.forEach((term, idx) => {
            const match = s.correctMatches && s.correctMatches[idx];
            if (highlightAnswer && match) {
              leftItems.push({
                text: term + "  →  ",
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false }
              });
              leftItems.push({
                text: `[ ${match} ]`,
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: accentHex, bold: true, bullet: false, breakLine: true }
              });
            } else {
              leftItems.push({
                text: term,
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, breakLine: true }
              });
            }
          });

          slide.addText(leftItems, {
            x: 0.8,
            y: 1.8,
            w: 5.5,
            h: 5.0,
            valign: 'top',
            fit: 'shrink',
            wrap: true
          });
        }

        // Render Right Column
        if (rightDefs.length > 0) {
          const rightItems = rightDefs.map(def => ({
            text: def,
            options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: false, lineSpacing: 32, breakLine: true }
          }));

          slide.addText(rightItems, {
            x: 7.0,
            y: 1.8,
            w: 5.5,
            h: 5.0,
            valign: 'top',
            fit: 'shrink',
            wrap: true
          });
        }
        break;
      }

      case 'odd_one_out': {
        const titleText = highlightAnswer ? `${s.title || "Odd One Out"} (Answer)` : (s.title || "Odd One Out");
        slide.addText(titleText, {
          x: 0.8,
          y: 0.4,
          w: 11.7,
          h: 1.2,
          fontSize: 24,
          bold: false,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink',
          wrap: true
        });

        if (s.bullets && s.bullets.length > 0) {
          const listItems = [];
          s.bullets.forEach(b => {
            const isCorrect = highlightAnswer && s.correctAnswer && (
              b.trim().startsWith(s.correctAnswer.trim()) ||
              s.correctAnswer.trim().startsWith(b.trim().substring(0, 2)) ||
              b.trim().includes(s.correctAnswer.trim())
            );
            if (isCorrect) {
              listItems.push({
                text: b + "  ",
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true }
              });
              listItems.push({
                text: "← [ ODD ONE OUT ]",
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: accentHex, bold: true, bullet: false, breakLine: true }
              });
            } else {
              listItems.push({
                text: b,
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, breakLine: true }
              });
            }
          });

          slide.addText(listItems, {
            x: 0.8,
            y: 1.8,
            w: 11.7,
            h: 5.0,
            valign: 'top',
            fit: 'shrink',
            wrap: true
          });
        }
        break;
      }

      case 'exit_ticket': {
        slide.addText(s.title || "Exit Ticket", {
          x: 0.8,
          y: 0.4,
          w: 11.7,
          h: 1.2,
          fontSize: 24,
          bold: false,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink',
          wrap: true
        });

        if (s.bullets && s.bullets.length > 0) {
          const listItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, lineSpacing: 32, breakLine: true }
          }));

          slide.addText(listItems, {
            x: 0.8,
            y: 1.8,
            w: 11.7,
            h: 5.0,
            valign: 'top',
            fit: 'shrink',
            wrap: true
          });
        }
        break;
      }

      case 'summary':
        // Section Header (38pt, bold, accent color)
        slide.addText(s.title || "Key Takeaways", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 38,
          bold: true,
          color: accentHex,
          fontFace: FONT_FAMILY,
          fit: 'shrink'
        });

        // Summary bullets (24pt, near-black)
        if (s.bullets && s.bullets.length > 0) {
          const summaryItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, lineSpacing: 36 }
          }));

          slide.addText(summaryItems, {
            x: 0.8,
            y: 1.6,
            w: 8.4,
            h: 3.2,
            valign: 'top'
          });
        }
        break;
      
      default:
        // Generic fallback slide layout
        slide.addText(s.title || "Slide Content", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 38,
          bold: true,
          color: accentHex,
          fontFace: FONT_FAMILY
        });

        if (s.bullets && s.bullets.length > 0) {
          const fallbackItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true }
          }));

          slide.addText(fallbackItems, {
            x: 0.8,
            y: 1.5,
            w: 8.4,
            h: 3.2,
            valign: 'top'
          });
        }
    }
  };

  for (const s of slides) {
    const slide = pptx.addSlide();
    renderSingleSlide(slide, s, false);

    if (['mcq', 'true_false', 'fill_blank', 'matching', 'odd_one_out'].includes(s.type)) {
      const answerSlide = pptx.addSlide();
      renderSingleSlide(answerSlide, s, true);
    }
  }

  // Generate binary presentation buffer
  const binaryBuffer = await pptx.write('nodebuffer');
  return binaryBuffer;
}
