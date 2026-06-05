import pptxgen from 'pptxgenjs';

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

        // Right Column: Visual Evidence Card (with accent color border highlights)
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 5.1,
          y: 1.4,
          w: 4.3,
          h: 3.6,
          fill: { color: "F1F5F9" }, // Slate-100 card fill
          line: { color: accentHex, width: 2 }
        });

        // Text inside the Visual Card
        slide.addText([
          { text: "📊 VISUAL EVIDENCE:\n\n", options: { bold: true, fontSize: 16, color: accentHex, fontFace: FONT_FAMILY } },
          { text: s.visualDescription || "Diagram placeholder detailing key concept dynamics.", options: { fontSize: 14, color: TEXT_COLOR, fontFace: FONT_FAMILY } }
        ], {
          x: 5.3,
          y: 1.6,
          w: 3.9,
          h: 3.2,
          valign: 'top'
        });
        break;

      case 'interactive':
        // Header (38pt, bold, accent color)
        slide.addText(s.title || "Check for Understanding", {
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
        slide.addText(s.question || "Discuss the main takeaway.", {
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
            const isCorrect = s.correctAnswer && (opt.startsWith(s.correctAnswer) || opt.includes(s.correctAnswer));
            const yPos = 2.4 + (idx * (rowHeight + 0.15));

            // Option background card
            slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
              x: 0.8,
              y: yPos,
              w: 8.4,
              h: rowHeight,
              fill: { color: isCorrect ? "F1F5F9" : BG_COLOR },
              line: { color: isCorrect ? accentHex : "E2E8F0", width: isCorrect ? 2 : 1 }
            });

            // Option text
            slide.addText(opt, {
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
