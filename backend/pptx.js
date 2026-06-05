import pptxgen from 'pptxgenjs';

/**
 * Compiles a structured slides JSON object into a styled PPTX file buffer.
 * 
 * @param {Object} slidesJSON - The JSON structure containing slide definitions
 * @param {string} themeName - Theme option (e.g. "Default", "Sleek Dark", "Warm Editorial", "Bright Playground")
 * @returns {Promise<Buffer>} The generated PPTX file buffer
 */
export async function compilePresentation(slidesJSON, themeName = "Default") {
  const pptx = new pptxgen();
  
  // Set presentation layout to widescreen (16:9)
  pptx.layout = 'LAYOUT_16x9';

  // Define color palettes for each theme
  const themes = {
    "Default": {
      bg: "F8FAFC",       // slate-50
      text: "0F172A",     // slate-900
      accent: "2563EB",   // blue-600
      cardBg: "E2E8F0",   // slate-200
      cardText: "334155", // slate-700
      font: "Inter"
    },
    "Sleek Dark": {
      bg: "0F172A",       // slate-900
      text: "F8FAFC",     // slate-50
      accent: "10B981",   // emerald-500
      cardBg: "1E293B",   // slate-800
      cardText: "E2E8F0", // slate-200
      font: "Inter"
    },
    "Warm Editorial": {
      bg: "FAF7F0",       // Cream/Warm Sand
      text: "2D2727",     // Dark brown-grey
      accent: "C2410C",   // Terracotta/Rust orange
      cardBg: "F3EFE0",   // Soft beige
      cardText: "4A3F3F", // Muted dark
      font: "Georgia"
    },
    "Bright Playground": {
      bg: "FEFBE8",       // Yellow-50
      text: "1E3A8A",     // Navy-900
      accent: "F97316",   // Orange-500
      cardBg: "FEF9C3",   // Yellow-100
      cardText: "1E3A8A", // Navy-900
      font: "Comic Sans MS" // Highly readable for younger learners
    }
  };

  const style = themes[themeName] || themes["Default"];

  const slides = slidesJSON.slides || [];

  for (const s of slides) {
    const slide = pptx.addSlide();
    
    // 1. Set background color
    slide.background = { fill: style.bg };

    // 2. Map notes
    if (s.notes) {
      slide.addNotes(s.notes);
    }

    switch (s.type) {
      case 'title':
        // Big Title
        slide.addText(s.title || "Lesson Topic", {
          x: 0.8,
          y: 1.5,
          w: 8.4,
          h: 1.5,
          fontSize: 44,
          bold: true,
          color: style.accent,
          fontFace: style.font,
          valign: 'middle'
        });

        // Subtitle
        slide.addText(s.subtitle || "Subject & Level", {
          x: 0.8,
          y: 3.2,
          w: 8.4,
          h: 0.8,
          fontSize: 22,
          color: style.text,
          fontFace: style.font,
          valign: 'top'
        });

        // Decorative Accent Line
        slide.addShape(pptx.shapes.RECTANGLE, {
          x: 0.8,
          y: 3.0,
          w: 3.0,
          h: 0.08,
          fill: { color: style.accent }
        });
        break;

      case 'objectives':
        // Section Header
        slide.addText(s.title || "Learning Objectives", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: style.accent,
          fontFace: style.font
        });

        // Objective items
        if (s.bullets && s.bullets.length > 0) {
          const listItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: style.font, color: style.text, bullet: true, lineSpacing: 36 }
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
        // Section Header
        slide.addText(s.title || "Roadmap", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: style.accent,
          fontFace: style.font
        });

        // Agenda items
        if (s.bullets && s.bullets.length > 0) {
          const listItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 22, fontFace: style.font, color: style.text, bullet: true, lineSpacing: 32 }
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
        // Assertion Header (a full sentence summarizing the slide)
        slide.addText(s.title || "", {
          x: 0.6,
          y: 0.3,
          w: 8.8,
          h: 0.9,
          fontSize: 26,
          bold: true,
          color: style.text,
          fontFace: style.font,
          valign: 'middle'
        });

        // Split Layout: Bullets on Left, Visual Evidence Card on Right
        // Left Column: Core Idea Bullet Points (Max 4, short phrases, size 24pt+)
        if (s.bullets && s.bullets.length > 0) {
          const contentItems = s.bullets.slice(0, 4).map(b => ({
            text: b,
            options: { fontSize: 22, fontFace: style.font, color: style.text, bullet: true, lineSpacing: 30 }
          }));

          slide.addText(contentItems, {
            x: 0.6,
            y: 1.4,
            w: 4.2,
            h: 3.6,
            valign: 'top'
          });
        }

        // Right Column: Visual Evidence Card (High Contrast & Clear)
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 5.1,
          y: 1.4,
          w: 4.3,
          h: 3.6,
          fill: { color: style.cardBg },
          line: { color: style.accent, width: 2 }
        });

        // Text inside the Visual Card
        slide.addText([
          { text: "📊 VISUAL EVIDENCE:\n\n", options: { bold: true, fontSize: 16, color: style.accent, fontFace: style.font } },
          { text: s.visualDescription || "Diagram placeholder detailing key concept dynamics.", options: { fontSize: 14, color: style.cardText, fontFace: style.font } }
        ], {
          x: 5.3,
          y: 1.6,
          w: 3.9,
          h: 3.2,
          valign: 'top'
        });
        break;

      case 'interactive':
        // Header
        slide.addText(s.title || "Check for Understanding", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: style.accent,
          fontFace: style.font
        });

        // Question block
        slide.addText(s.question || "Discuss the main takeaway.", {
          x: 0.8,
          y: 1.3,
          w: 8.4,
          h: 1.0,
          fontSize: 24,
          bold: true,
          color: style.text,
          fontFace: style.font,
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
              fill: { color: isCorrect ? style.cardBg : style.bg },
              line: { color: isCorrect ? style.accent : style.cardBg, width: isCorrect ? 2 : 1 }
            });

            // Option text
            slide.addText(opt, {
              x: 1.0,
              y: yPos,
              w: 8.0,
              h: rowHeight,
              fontSize: 18,
              bold: !!isCorrect,
              color: isCorrect ? style.accent : style.text,
              fontFace: style.font,
              valign: 'middle'
            });
          });
        }
        break;

      case 'summary':
        // Section Header
        slide.addText(s.title || "Key Takeaways", {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: style.accent,
          fontFace: style.font
        });

        // Summary bullets
        if (s.bullets && s.bullets.length > 0) {
          const summaryItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 24, fontFace: style.font, color: style.text, bullet: true, lineSpacing: 36 }
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
          fontSize: 32,
          bold: true,
          color: style.accent,
          fontFace: style.font
        });

        if (s.bullets && s.bullets.length > 0) {
          const fallbackItems = s.bullets.map(b => ({
            text: b,
            options: { fontSize: 22, fontFace: style.font, color: style.text, bullet: true }
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
