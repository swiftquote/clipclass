import pptxgen from 'pptxgenjs';

/**
 * Generates an image using Google Imagen and returns it as a Base64 data URI.
 *
 * @param {string} visualDescription - Slide image description text
 * @returns {Promise<string|null>} Base64 image data URI string, or null on failure
 */
async function generateImageFromImagen(visualDescription, deadline = Infinity) {
  if (!visualDescription) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Image Generator] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict";
  const cleanDescription = visualDescription.trim().replace(/[.,;:!?]+$/, "");
  const finalPrompt = `A clean, professional presentation slide illustration of: ${cleanDescription}. Clear visual metaphor, high quality. Strictly no text, no labels, no words, no characters, no typography, no letters, no numbers. Pure visual design without annotations.`;

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Respect the global generation deadline: never start a call we can't finish.
    const remainingBudget = deadline - Date.now();
    if (remainingBudget < 4000) {
      console.warn(`[Image Generator] Skipping attempt ${attempt} — generation deadline nearly reached (${Math.round(remainingBudget / 1000)}s left).`);
      return null;
    }
    const callTimeout = Math.min(15000, remainingBudget - 1000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), callTimeout);

    try {
      console.log(`[Image Generator] [Attempt ${attempt}/${maxRetries}] Fetching image from Imagen 4.0 for: "${finalPrompt.substring(0, 80)}..."`);
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
      clearTimeout(timeoutId);
      console.warn(`[Image Generator] [Attempt ${attempt}/${maxRetries}] failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = attempt * 1000 + Math.random() * 500; // Staggered retry delay (1s - 1.5s)
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[Image Generator] All attempts failed to generate image for: "${visualDescription}"`);
  return null;
}

/**
 * Generates an SVG diagram using Google Gemini 2.5 Flash and returns it as a Base64 data URI.
 *
 * @param {string} title - Slide title
 * @param {string} visualDescription - Visual diagram description
 * @returns {Promise<string|null>} Base64 SVG data URI string, or null on failure
 */
async function generateSvgFromGemini(title, visualDescription, deadline = Infinity) {
  if (!title && !visualDescription) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[SVG Generator] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

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

  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  for (const model of models) {
    // For the premium/slow model, only try once to save time budget.
    // For the fallback model, we can try up to 2 times.
    const maxAttempts = (model === "gemini-2.5-flash") ? 1 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Respect the global generation deadline
      const remainingBudget = deadline - Date.now();
      if (remainingBudget < 4000) {
        console.warn(`[SVG Generator] Skipping ${model} attempt ${attempt} — deadline nearly reached.`);
        return null;
      }

      // Enforce a shorter timeout for the primary model if we have a fallback available
      const callTimeout = (model === "gemini-2.5-flash")
        ? Math.min(10000, remainingBudget - 2000) // 10s timeout for gemini-2.5-flash
        : Math.min(15000, remainingBudget - 1000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), callTimeout);

      try {
        console.log(`[SVG Generator] [Model: ${model}] [Attempt ${attempt}/${maxAttempts}] Generating SVG for: "${title}"...`);
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
          throw new Error(`Status ${response.status}: ${errText}`);
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

        // Parse the real viewBox so the slide compiler can center the diagram
        // with the correct aspect ratio (the model doesn't always honor 680x400).
        let aspectRatio = 680 / 400;
        const vbMatch = cleanedText.match(/viewBox\s*=\s*["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
        if (vbMatch) {
          const vbW = parseFloat(vbMatch[1]);
          const vbH = parseFloat(vbMatch[2]);
          if (vbW > 0 && vbH > 0) {
            aspectRatio = vbW / vbH;
          }
        }

        // Convert raw SVG string to Base64 data URI
        const base64Data = Buffer.from(cleanedText).toString('base64');
        return { dataUri: `data:image/svg+xml;base64,${base64Data}`, aspectRatio };

      } catch (err) {
        clearTimeout(timeoutId);
        console.warn(`[SVG Generator] [Model: ${model}] [Attempt ${attempt}/${maxAttempts}] failed: ${err.message}`);
        
        // If the primary model fails (timeout or 503), do not retry it;
        // switch immediately to the fallback model to preserve time budget.
        if (model === "gemini-2.5-flash") {
          console.log(`[SVG Generator] Primary model failed. Switching immediately to fallback model.`);
          break;
        }

        if (attempt < maxAttempts) {
          const delay = attempt * 1000 + Math.random() * 500; // Staggered retry delay (1s - 1.5s)
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  console.error(`[SVG Generator] All models and retries failed to generate SVG for "${title}".`);
  return null;
}

/**
 * Compiles a structured slides JSON object into a styled PPTX file buffer.
 * Enforces global off-white background, near-black text, and a clean sans-serif (Inter).
 * 
 * @param {Object} slidesJSON - The JSON structure containing slide definitions
 * @param {string} accentName - Accent color choice (e.g. "Cobalt Blue", "Emerald Green", "Terracotta Rust", "Royal Purple", "Crimson Red")
 * @returns {Promise<Buffer>} The generated PPTX file buffer
 */
export async function compilePresentation(slidesJSON, accentName = "Cobalt Blue", deadline = Date.now() + 45000) {
  const pptx = new pptxgen();
  
  // Set presentation layout to widescreen 13.33in x 7.5in.
  // CRITICAL: All activity-slide coordinates (w: 11.7 etc.) were authored for this
  // canvas. The previous 'LAYOUT_16x9' is only 10in x 5.625in, which pushed text
  // boxes off the right edge and below the bottom of the slide.
  pptx.layout = 'LAYOUT_WIDE';
  const SLIDE_W = 13.33;
  const SLIDE_H = 7.5;

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

  // Generate all slide visuals (both SVG diagrams and Imagen images) concurrently in parallel,
  // but stagger the start times by 350ms to prevent hitting rate limit / concurrency ceilings.
  const visualPromises = [];
  let staggerDelay = 0;
  for (const s of slides) {
    if (s.type === 'content') {
      // Force visualMethod to 'svg' if the visualDescription indicates a diagram, chart, or labelled illustration.
      // This prevents Imagen from trying to render hallucinated text labels.
      const desc = (s.visualDescription || "").toLowerCase();
      if (desc.includes("diagram") || desc.includes("chart") || desc.includes("labelled") || desc.includes("labeled") || desc.includes("illustration of")) {
        s.visualMethod = 'svg';
      }

      const currentDelay = staggerDelay;
      staggerDelay += 200; // shorter stagger — still spreads the burst, saves wall-clock time

      if (s.visualMethod === 'svg') {
        visualPromises.push((async () => {
          if (currentDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, currentDelay));
          }
          const svgResult = await generateSvgFromGemini(s.title, s.visualDescription, deadline);
          if (svgResult) {
            s.imageBase64 = svgResult.dataUri;
            s.imageAspectRatio = svgResult.aspectRatio;
          } else {
            s.imageBase64 = null;
          }
        })());
      } else {
        visualPromises.push((async () => {
          if (currentDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, currentDelay));
          }
          s.imageBase64 = await generateImageFromImagen(s.visualDescription, deadline);
          s.imageAspectRatio = 16 / 9; // Imagen called with aspectRatio "16:9"
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
        // Big Title (44pt, clean sans-serif, accent color)
        slide.addText(s.title || "Lesson Topic", {
          x: 1.0,
          y: 2.0,
          w: 11.3,
          h: 1.9,
          fontSize: 44,
          bold: true,
          color: accentHex,
          fontFace: FONT_FAMILY,
          valign: 'bottom',
          fit: 'shrink'
        });

        // Decorative Accent Bar — explicit no-outline so it can't render as a
        // stray underline, and positioned with clear air below the title box.
        slide.addShape(pptx.shapes.RECTANGLE, {
          x: 1.0,
          y: 4.15,
          w: 3.4,
          h: 0.09,
          fill: { color: accentHex },
          line: { type: 'none' }
        });

        // Subtitle (24pt, near-black text)
        slide.addText(s.subtitle || "Subject & Level", {
          x: 1.0,
          y: 4.45,
          w: 11.3,
          h: 0.9,
          fontSize: 24,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'top'
        });
        break;

      case 'objectives':
        // Section Header (38pt, bold, accent color)
        slide.addText(s.title || "Learning Objectives", {
          x: 0.8,
          y: 0.5,
          w: 11.7,
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
            y: 1.8,
            w: 11.7,
            h: 5.2,
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
          w: 11.7,
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
            y: 1.7,
            w: 11.7,
            h: 5.3,
            valign: 'top',
            fit: 'shrink'
          });
        }
        break;

      case 'content': {
        // Assertion Header (a full-sentence claim, bold, near-black)
        const headerText = s.title || "";
        let headerFontSize = 28;
        if (headerText.length > 120) {
          headerFontSize = 20;
        } else if (headerText.length > 80) {
          headerFontSize = 24;
        }

        slide.addText(headerText, {
          x: 0.7,
          y: 0.35,
          w: 11.9,
          h: 1.15,
          fontSize: headerFontSize,
          bold: true,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle',
          fit: 'shrink'
        });

        // Split Layout: Bullets on Left, Visual Evidence on Right
        if (s.bullets && s.bullets.length > 0) {
          const contentItems = s.bullets.slice(0, 4).map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, lineSpacing: 36 }
          }));

          slide.addText(contentItems, {
            x: 0.7,
            y: 1.8,
            w: 5.9,
            h: 5.2,
            valign: 'top',
            fit: 'shrink'
          });
        }

        // Visual region on the right half of the wide canvas
        const REGION = { x: 7.0, y: 1.8, w: 5.6, h: 4.9 };

        if (s.imageBase64) {
          // Mathematically center the image inside the region using its known
          // aspect ratio. pptxgenjs `sizing: contain` top-left-anchors the scaled
          // image, which caused inconsistent placement — so we size it ourselves.
          // Imagen output is always 16:9; generated SVGs use viewBox 680x400.
          const imgAR = s.imageAspectRatio || (s.visualMethod === 'svg' ? 680 / 400 : 16 / 9);
          const regionAR = REGION.w / REGION.h;

          let drawW, drawH;
          if (imgAR >= regionAR) {
            drawW = REGION.w;
            drawH = REGION.w / imgAR;
          } else {
            drawH = REGION.h;
            drawW = REGION.h * imgAR;
          }

          const drawX = REGION.x + (REGION.w - drawW) / 2;
          const drawY = REGION.y + (REGION.h - drawH) / 2;

          // Soft white card behind the visual for a consistent frame
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: REGION.x - 0.1,
            y: REGION.y - 0.1,
            w: REGION.w + 0.2,
            h: REGION.h + 0.2,
            fill: { color: "FFFFFF" },
            line: { color: "E2E8F0", width: 1 },
            rectRadius: 0.08
          });

          slide.addImage({
            data: s.imageBase64,
            x: drawX,
            y: drawY,
            w: drawW,
            h: drawH
          });
        } else {
          // Right Column: Fallback Native Concept Card (when image generation fails)
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: REGION.x,
            y: REGION.y,
            w: REGION.w,
            h: REGION.h,
            fill: { color: "F1F5F9" }, // Slate-100 card fill
            line: { color: accentHex, width: 2 },
            rectRadius: 0.08
          });

          // "KEY CONCEPT" header pill
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: REGION.x + 0.35,
            y: REGION.y + 0.35,
            w: 1.7,
            h: 0.4,
            fill: { color: accentHex },
            line: { type: 'none' },
            rectRadius: 0.2
          });
          slide.addText("KEY CONCEPT", {
            x: REGION.x + 0.35,
            y: REGION.y + 0.35,
            w: 1.7,
            h: 0.4,
            fontSize: 11,
            bold: true,
            color: "FFFFFF",
            fontFace: FONT_FAMILY,
            align: 'center',
            valign: 'middle'
          });

          const fallbackText = s.visualDescription || s.title || "Visual representation not available.";
          slide.addText(fallbackText, {
            x: REGION.x + 0.35,
            y: REGION.y + 1.0,
            w: REGION.w - 0.7,
            h: REGION.h - 1.35,
            fontSize: 16,
            italic: true,
            color: TEXT_COLOR,
            fontFace: FONT_FAMILY,
            valign: 'top',
            wrap: true,
            fit: 'shrink'
          });
        }
        break;
      }

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
          const rowHeight = 0.95;
          const spacing = 0.2;
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

          let fontSize = 20;
          if (maxLen > 110) {
            fontSize = 12;
          } else if (maxLen > 90) {
            fontSize = 14;
          } else if (maxLen > 75) {
            fontSize = 16;
          } else if (maxLen > 60) {
            fontSize = 18;
          }

          const startY = 1.8;
          const rowHeight = 0.9;
          const spacing = 0.15;
          s.bullets.forEach((b, idx) => {
            const ans = s.correctAnswers && s.correctAnswers[idx];
            const yPos = startY + (idx * (rowHeight + spacing));

            if (highlightAnswer && ans) {
              const ansColor = ans.toLowerCase().includes("true") ? accentHex : "C2410C";
              slide.addText([
                { text: b + "  →  ", options: { fontSize: fontSize, fontFace: FONT_FAMILY, color: TEXT_COLOR } },
                { text: `[ ${ans} ]`, options: { fontSize: fontSize, fontFace: FONT_FAMILY, color: ansColor, bold: true } }
              ], {
                x: 0.8,
                y: yPos,
                w: 11.7,
                h: rowHeight,
                valign: 'middle',
                wrap: true
              });
            } else {
              slide.addText(b, {
                x: 0.8,
                y: yPos,
                w: 11.7,
                h: rowHeight,
                fontSize: fontSize,
                fontFace: FONT_FAMILY,
                color: TEXT_COLOR,
                valign: 'middle',
                wrap: true
              });
            }
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
          const startY = 1.8;
          const rowHeight = 0.9;
          const spacing = 0.15;
          s.bullets.forEach((b, idx) => {
            const ans = s.correctAnswers && s.correctAnswers[idx];
            const yPos = startY + (idx * (rowHeight + spacing));

            if (highlightAnswer && ans) {
              const parts = b.split(/__+/);
              if (parts.length >= 2) {
                slide.addText([
                  { text: parts[0], options: { fontSize: 20, fontFace: FONT_FAMILY, color: TEXT_COLOR } },
                  { text: `[ ${ans} ]`, options: { fontSize: 20, fontFace: FONT_FAMILY, color: accentHex, bold: true } },
                  { text: parts.slice(1).join(""), options: { fontSize: 20, fontFace: FONT_FAMILY, color: TEXT_COLOR } }
                ], {
                  x: 0.8,
                  y: yPos,
                  w: 11.7,
                  h: rowHeight,
                  valign: 'middle',
                  wrap: true
                });
              } else {
                slide.addText([
                  { text: b + "  ", options: { fontSize: 20, fontFace: FONT_FAMILY, color: TEXT_COLOR } },
                  { text: `[ ${ans} ]`, options: { fontSize: 20, fontFace: FONT_FAMILY, color: accentHex, bold: true } }
                ], {
                  x: 0.8,
                  y: yPos,
                  w: 11.7,
                  h: rowHeight,
                  valign: 'middle',
                  wrap: true
                });
              }
            } else {
              slide.addText(b, {
                x: 0.8,
                y: yPos,
                w: 11.7,
                h: rowHeight,
                fontSize: 20,
                fontFace: FONT_FAMILY,
                color: TEXT_COLOR,
                valign: 'middle',
                wrap: true
              });
            }
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

        const startY = 1.8;
        const rowHeight = 0.9;
        const spacing = 0.15;

        // Render Left Column
        if (leftTerms.length > 0) {
          leftTerms.forEach((term, idx) => {
            const match = s.correctMatches && s.correctMatches[idx];
            const yPos = startY + (idx * (rowHeight + spacing));

            if (highlightAnswer && match) {
              slide.addText([
                { text: term + "  →  ", options: { fontSize: 20, fontFace: FONT_FAMILY, color: TEXT_COLOR } },
                { text: `[ ${match} ]`, options: { fontSize: 20, fontFace: FONT_FAMILY, color: accentHex, bold: true } }
              ], {
                x: 0.8,
                y: yPos,
                w: 5.5,
                h: rowHeight,
                valign: 'middle',
                wrap: true
              });
            } else {
              slide.addText(term, {
                x: 0.8,
                y: yPos,
                w: 5.5,
                h: rowHeight,
                fontSize: 20,
                fontFace: FONT_FAMILY,
                color: TEXT_COLOR,
                valign: 'middle',
                wrap: true
              });
            }
          });
        }

        // Render Right Column
        if (rightDefs.length > 0) {
          rightDefs.forEach((def, idx) => {
            const yPos = startY + (idx * (rowHeight + spacing));
            slide.addText(def, {
              x: 7.0,
              y: yPos,
              w: 5.5,
              h: rowHeight,
              fontSize: 20,
              fontFace: FONT_FAMILY,
              color: TEXT_COLOR,
              valign: 'middle',
              wrap: true
            });
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
          const startY = 1.8;
          const rowHeight = 0.9;
          const spacing = 0.15;
          s.bullets.forEach((b, idx) => {
            const yPos = startY + (idx * (rowHeight + spacing));
            const isCorrect = highlightAnswer && s.correctAnswer && (
              b.trim().startsWith(s.correctAnswer.trim()) ||
              s.correctAnswer.trim().startsWith(b.trim().substring(0, 2)) ||
              b.trim().includes(s.correctAnswer.trim())
            );

            if (isCorrect) {
              slide.addText([
                { text: b + "  ", options: { fontSize: 20, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true } },
                { text: "← [ ODD ONE OUT ]", options: { fontSize: 20, fontFace: FONT_FAMILY, color: accentHex, bold: true } }
              ], {
                x: 0.8,
                y: yPos,
                w: 11.7,
                h: rowHeight,
                valign: 'middle',
                wrap: true
              });
            } else {
              slide.addText(b, {
                x: 0.8,
                y: yPos,
                w: 11.7,
                h: rowHeight,
                fontSize: 20,
                fontFace: FONT_FAMILY,
                color: TEXT_COLOR,
                bullet: true,
                valign: 'middle',
                wrap: true
              });
            }
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
          const startY = 1.8;
          const rowHeight = 0.9;
          const spacing = 0.15;
          s.bullets.forEach((b, idx) => {
            const yPos = startY + (idx * (rowHeight + spacing));
            slide.addText(b, {
              x: 0.8,
              y: yPos,
              w: 11.7,
              h: rowHeight,
              fontSize: 20,
              fontFace: FONT_FAMILY,
              color: TEXT_COLOR,
              bullet: true,
              valign: 'middle',
              wrap: true
            });
          });
        }
        break;
      }

      case 'summary':
        // Section Header (38pt, bold, accent color)
        slide.addText(s.title || "Key Takeaways", {
          x: 0.8,
          y: 0.5,
          w: 11.7,
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
            y: 1.8,
            w: 11.7,
            h: 5.2,
            valign: 'top',
            fit: 'shrink'
          });
        }
        break;
      
      default:
        // Generic fallback slide layout
        slide.addText(s.title || "Slide Content", {
          x: 0.8,
          y: 0.5,
          w: 11.7,
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
            y: 1.7,
            w: 11.7,
            h: 5.3,
            valign: 'top',
            fit: 'shrink'
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
