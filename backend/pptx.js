import pptxgen from 'pptxgenjs';

/**
 * Generates an image using Hugging Face Inference API and returns it as a Base64 data URI.
 *
 * @param {string} visualDescription - Slide image description text
 * @returns {Promise<string|null>} Base64 image data URI string, or null on failure
 */
async function generateImageFromHuggingFace(visualDescription) {
  if (!visualDescription) return null;

  const token = process.env.HF_TOKEN;
  if (!token) {
    console.error("[Image Generator] Hugging Face token (HF_TOKEN) is missing.");
    return null;
  }

  const url = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout

  try {
    console.log(`[Image Generator] Fetching image from Hugging Face for: "${visualDescription.substring(0, 60)}..."`);
    const response = await fetch(url, {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: visualDescription })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Hugging Face Inference API responded with status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (err) {
    console.error("[Image Generator] Hugging Face image generation failed:", err.message);
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

  // Generate slide visuals sequentially.
  for (const s of slides) {
    if (s.type === 'content') {
      s.imageBase64 = await generateImageFromHuggingFace(s.visualDescription);
    }
  }

  const renderSingleInteractiveSlide = (targetSlide, s, highlightAnswer) => {
    // Header (38pt, bold, accent color)
    const titleText = highlightAnswer ? `${s.title || "Check Your Understanding"} (Answer)` : (s.title || "Check Your Understanding");
    targetSlide.addText(titleText, {
      x: 0.8,
      y: 0.5,
      w: 8.4,
      h: 0.8,
      fontSize: 38,
      bold: true,
      color: accentHex,
      fontFace: FONT_FAMILY
    });

    // Question block (24pt, bold, near-black)
    targetSlide.addText(s.question || "Discuss the main takeaway.", {
      x: 0.8,
      y: 1.3,
      w: 8.4,
      h: 1.0,
      fontSize: 24,
      bold: true,
      color: TEXT_COLOR,
      fontFace: FONT_FAMILY,
      valign: 'middle'
    });

    // Options (rendered as neat cards if present)
    if (s.options && s.options.length > 0) {
      const rowHeight = 0.6;
      s.options.slice(0, 4).forEach((opt, idx) => {
        const isCorrect = highlightAnswer && s.correctAnswer && (opt.startsWith(s.correctAnswer) || opt.includes(s.correctAnswer));
        const yPos = 2.4 + (idx * (rowHeight + 0.15));

        // Option background card
        targetSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8,
          y: yPos,
          w: 8.4,
          h: rowHeight,
          fill: { color: isCorrect ? "F1F5F9" : BG_COLOR },
          line: { color: isCorrect ? accentHex : "E2E8F0", width: isCorrect ? 2 : 1 }
        });

        // Option text
        targetSlide.addText(opt, {
          x: 1.0,
          y: yPos,
          w: 8.0,
          h: rowHeight,
          fontSize: 18,
          bold: !!isCorrect,
          color: isCorrect ? accentHex : TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle'
        });
      });
    }
  };

  for (const s of slides) {
    const slide = pptx.addSlide();
    
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
          valign: 'middle'
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
          fontFace: FONT_FAMILY
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
            valign: 'top'
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
          fontFace: FONT_FAMILY
        });

        // Agenda items (22pt, near-black, bulleted)
        if (s.bullets && s.bullets.length > 0) {
          const listItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bullet: true, lineSpacing: 32 }
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
        slide.addText(s.title || "", {
          x: 0.6,
          y: 0.3,
          w: 8.8,
          h: 0.9,
          fontSize: 26,
          bold: true,
          color: TEXT_COLOR,
          fontFace: FONT_FAMILY,
          valign: 'middle'
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
          // Render the actual photographic image
          slide.addImage({
            data: s.imageBase64,
            x: 5.1,
            y: 1.4,
            w: 4.3,
            h: 2.7,
            sizing: { type: 'cover', w: 4.3, h: 2.7 }
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

      case 'interactive':
        // Render Slide A: The Question slide (highlightAnswer = false)
        renderSingleInteractiveSlide(slide, s, false);

        // Render Slide B: The Answer slide (highlightAnswer = true)
        const answerSlide = pptx.addSlide();
        answerSlide.background = { fill: BG_COLOR };
        if (s.notes) {
          answerSlide.addNotes(s.notes);
        }
        renderSingleInteractiveSlide(answerSlide, s, true);
        break;

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
          fontFace: FONT_FAMILY
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
  }

  // Generate binary presentation buffer
  const binaryBuffer = await pptx.write('nodebuffer');
  return binaryBuffer;
}
