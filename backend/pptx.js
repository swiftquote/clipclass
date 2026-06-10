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
 * Renders a structured JSON drawing specification into a styled, auto-fitted, centred SVG string.
 *
 * @param {Object} spec - JSON drawing spec with elements (polygons, rects, circles, lines, arrows, labels)
 * @param {string} accentHex - Accent theme hex color (e.g. "#2563EB")
 * @returns {string} SVG string
 */
function renderSvgFromSpec(spec, accentHex) {
  if (!spec || !Array.isArray(spec.elements)) {
    throw new Error("Invalid specification format: elements must be an array.");
  }

  const canvasW = 640;
  const canvasH = 560;
  const margin = 40;

  // Mix accent color with white to get a soft light-accent tint
  const getLightAccent = (hexStr) => {
    const cleanHex = hexStr.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    const mix = (val) => Math.round(val + (255 - val) * 0.88).toString(16).padStart(2, '0');
    return `#${mix(r)}${mix(g)}${mix(b)}`;
  };

  const palette = {
    "accent": accentHex,
    "accent-light": getLightAccent(accentHex),
    "neutral": "#334155", // Slate-700
    "neutral-light": "#F8FAFC", // Slate-50
    "none": "none"
  };

  const strokePalette = {
    "accent": accentHex,
    "neutral": "#334155", // Slate-700
    "none": "none"
  };

  const num = (val) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  };

  // Find bounding box of all geometric elements to determine scaling & centring
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const updateMinMax = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  spec.elements.forEach(el => {
    switch (el.type) {
      case 'polygon':
        if (Array.isArray(el.points)) {
          el.points.forEach(pt => {
            if (Array.isArray(pt) && pt.length >= 2) {
              const px = num(pt[0]);
              const py = num(pt[1]);
              if (px !== null && py !== null) {
                updateMinMax(px, py);
              }
            }
          });
        }
        break;
      case 'rect': {
        const x = num(el.x);
        const y = num(el.y);
        const w = num(el.w);
        const h = num(el.h);
        if (x !== null && y !== null && w !== null && h !== null) {
          updateMinMax(x, y);
          updateMinMax(x + w, y + h);
        }
        break;
      }
      case 'circle': {
        const cx = num(el.cx);
        const cy = num(el.cy);
        const r = num(el.r);
        if (cx !== null && cy !== null && r !== null) {
          updateMinMax(cx - r, cy - r);
          updateMinMax(cx + r, cy + r);
        }
        break;
      }
      case 'line':
      case 'arrow': {
        const x1 = num(el.x1);
        const y1 = num(el.y1);
        const x2 = num(el.x2);
        const y2 = num(el.y2);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          updateMinMax(x1, y1);
          updateMinMax(x2, y2);
        }
        break;
      }
      case 'label': {
        const x = num(el.x);
        const y = num(el.y);
        if (x !== null && y !== null && el.text) {
          const textLen = String(el.text).length;
          const estW = textLen * 11; // 22px font size approx character width
          const estH = 24;
          const anchor = el.anchor || 'middle';
          
          let lMinX, lMaxX;
          if (anchor === 'start') {
            lMinX = x;
            lMaxX = x + estW;
          } else if (anchor === 'end') {
            lMinX = x - estW;
            lMaxX = x;
          } else {
            lMinX = x - estW / 2;
            lMaxX = x + estW / 2;
          }
          const lMinY = y - estH / 2;
          const lMaxY = y + estH / 2;

          updateMinMax(lMinX, lMinY);
          updateMinMax(lMaxX, lMaxY);
        }
        break;
      }
    }
  });

  // Handle case with no geometries
  if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    minX = 0; maxX = 100; minY = 0; maxY = 100;
  }

  const geomW = maxX - minX;
  const geomH = maxY - minY;
  const W = geomW === 0 ? 1 : geomW;
  const H = geomH === 0 ? 1 : geomH;

  const targetW = canvasW - 2 * margin; // 560
  const targetH = canvasH - 2 * margin; // 480

  const S = Math.min(targetW / W, targetH / H);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Geometry translation to centre at (320, 280)
  const dx = 320 - cx * S;
  const dy = 280 - cy * S;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560" width="100%" height="100%">\n`;
  svg += `  <rect width="640" height="560" fill="#FFFFFF" />\n`;

  // Define marker for arrowheads
  svg += `  <defs>\n`;
  svg += `    <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">\n`;
  svg += `      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${palette.neutral}" />\n`;
  svg += `    </marker>\n`;
  svg += `    <marker id="arrowhead-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">\n`;
  svg += `      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${palette.accent}" />\n`;
  svg += `    </marker>\n`;
  svg += `  </defs>\n`;

  // Start group for transformed geometry
  svg += `  <g transform="translate(${dx}, ${dy}) scale(${S})">\n`;

  const getFill = (f) => palette[f] || palette["neutral-light"];
  const getStroke = (s) => strokePalette[s] || strokePalette["neutral"];

  // First pass: render all geometries (except labels)
  spec.elements.forEach(el => {
    if (el.type === 'label') return;

    const fillVal = getFill(el.fill);
    const strokeVal = getStroke(el.stroke);
    const strokeWidth = 3;

    switch (el.type) {
      case 'polygon':
        if (Array.isArray(el.points) && el.points.length >= 2) {
          const validPts = [];
          el.points.forEach(pt => {
            if (Array.isArray(pt) && pt.length >= 2) {
              const px = num(pt[0]);
              const py = num(pt[1]);
              if (px !== null && py !== null) validPts.push([px, py]);
            }
          });
          if (validPts.length >= 2) {
            const pointsStr = validPts.map(pt => pt.join(',')).join(' ');
            svg += `    <polygon points="${pointsStr}" fill="${fillVal}" stroke="${strokeVal}" stroke-width="${strokeWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke" />\n`;
          }
        }
        break;
      case 'rect': {
        const x = num(el.x);
        const y = num(el.y);
        const w = num(el.w);
        const h = num(el.h);
        if (x !== null && y !== null && w !== null && h !== null) {
          svg += `    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillVal}" stroke="${strokeVal}" stroke-width="${strokeWidth}" stroke-linejoin="round" rx="4" vector-effect="non-scaling-stroke" />\n`;
        }
        break;
      }
      case 'circle': {
        const cx = num(el.cx);
        const cy = num(el.cy);
        const r = num(el.r);
        if (cx !== null && cy !== null && r !== null) {
          svg += `    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fillVal}" stroke="${strokeVal}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" />\n`;
        }
        break;
      }
      case 'line': {
        const x1 = num(el.x1);
        const y1 = num(el.y1);
        const x2 = num(el.x2);
        const y2 = num(el.y2);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          svg += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeVal}" stroke-width="${strokeWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke" />\n`;
        }
        break;
      }
      case 'arrow': {
        const x1 = num(el.x1);
        const y1 = num(el.y1);
        const x2 = num(el.x2);
        const y2 = num(el.y2);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          const markerId = el.stroke === 'accent' ? 'arrowhead-accent' : 'arrowhead';
          svg += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeVal}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#${markerId})" vector-effect="non-scaling-stroke" />\n`;
        }
        break;
      }
    }
  });

  svg += `  </g>\n`;

  // Second pass: render labels at transformed positions but unscaled text size (fixed 22px)
  svg += `  <g font-family="Inter, system-ui, -apple-system, sans-serif" font-size="22" font-weight="600">\n`;
  spec.elements.forEach(el => {
    if (el.type !== 'label') return;

    const x = num(el.x);
    const y = num(el.y);
    if (x === null || y === null || !el.text) return;

    const tx = 320 + (x - cx) * S;
    const ty = 280 + (y - cy) * S;
    const anchor = el.anchor || 'middle';
    const textAnchor = anchor === 'start' ? 'start' : anchor === 'end' ? 'end' : 'middle';

    const escapedText = String(el.text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Text halo for high readability
    svg += `    <text x="${tx}" y="${ty}" fill="white" stroke="white" stroke-width="6" stroke-linejoin="round" text-anchor="${textAnchor}" dominant-baseline="central" paint-order="stroke fill">${escapedText}</text>\n`;
    svg += `    <text x="${tx}" y="${ty}" fill="${palette.neutral}" text-anchor="${textAnchor}" dominant-baseline="central">${escapedText}</text>\n`;
  });
  svg += `  </g>\n`;

  svg += `</svg>`;
  return svg;
}

/**
 * Generates an SVG diagram spec using Gemini, compiles it, and returns a Base64 URI.
 * Falls back to freeform SVG code if the JSON spec route fails.
 *
 * @param {string} title - Slide title
 * @param {string} visualDescription - Visual diagram description
 * @param {number} deadline - Generation deadline timestamp
 * @param {string} accentHex - Slide theme accent color hex code
 * @returns {Promise<Object|null>} Object containing dataUri and aspectRatio, or null
 */
async function generateSvgFromGemini(title, visualDescription, deadline = Infinity, accentHex = "#2563EB") {
  if (!title && !visualDescription) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[SVG Generator] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

  // Prompt for JSON specification of drawing primitives
  const jsonSystemPrompt = `You are a professional presentation graphic designer and software engineer.
Your task is to design a clean, modern, and mathematically/technically accurate educational diagram and output its structure as a JSON specification of drawing primitives.
Canvas viewport: You can use any numeric coordinate space of your choice (e.g. 0 to 100, or exact geometric dimensions). The renderer will automatically calculate bounds, scale uniformly, and centre the diagram to fit the final viewport (640x560) with a 40px margin.

You must output ONLY a valid JSON object matching this schema:
{
  "elements": [
    {
      "type": "polygon",
      "points": [[x1, y1], [x2, y2], ...],
      "fill": "accent" | "accent-light" | "neutral" | "neutral-light" | "none",
      "stroke": "accent" | "neutral" | "none"
    },
    {
      "type": "rect",
      "x": x, "y": y, "w": w, "h": h,
      "fill": "accent" | "accent-light" | "neutral" | "neutral-light" | "none",
      "stroke": "accent" | "neutral" | "none"
    },
    {
      "type": "circle",
      "cx": cx, "cy": cy, "r": r,
      "fill": "accent" | "accent-light" | "neutral" | "neutral-light" | "none",
      "stroke": "accent" | "neutral" | "none"
    },
    {
      "type": "line",
      "x1": x1, "y1": y1, "x2": x2, "y2": y2,
      "stroke": "accent" | "neutral"
    },
    {
      "type": "arrow",
      "x1": x1, "y1": y1, "x2": x2, "y2": y2,
      "stroke": "accent" | "neutral"
    },
    {
      "type": "label",
      "x": x, "y": y,
      "text": "Label Text",
      "anchor": "start" | "middle" | "end"
    }
  ]
}

Styling Rules:
- "accent" is the primary theme color.
- "accent-light" is a soft fill tint of the accent color.
- "neutral" is a dark charcoal for outlines.
- "neutral-light" is a soft gray fill.
- Keep geometries clean and simple. Place labels close to the structures they describe.
- Do NOT output any markdown backticks (like \`\`\`json) or other text. Return ONLY the raw JSON object.`;

  const jsonUserPrompt = `Generate a clean educational diagram JSON spec for: ${visualDescription || title || ""}. Keep it simple, focused on one concept, and output ONLY valid JSON.`;

  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  for (const model of models) {
    const maxAttempts = (model === "gemini-2.5-flash") ? 1 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remainingBudget = deadline - Date.now();
      if (remainingBudget < 4000) {
        console.warn(`[SVG Generator] Skipping JSON spec ${model} attempt ${attempt} — deadline nearly reached.`);
        break;
      }

      const callTimeout = (model === "gemini-2.5-flash")
        ? Math.min(10000, remainingBudget - 2000)
        : Math.min(15000, remainingBudget - 1000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), callTimeout);

      try {
        console.log(`[SVG Generator] [Model: ${model}] [Attempt ${attempt}/${maxAttempts}] Generating JSON spec for: "${title}"...`);
        const response = await fetch(url, {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${jsonSystemPrompt}\n\n${jsonUserPrompt}` }] }],
            generationConfig: { temperature: 0.0 } // 0.0 temperature for precise coordinate math
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
          throw new Error("No content returned from Gemini API.");
        }

        let cleanedText = contentText.trim();
        if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
        }

        let isSpec = false;
        let spec = null;
        try {
          spec = JSON.parse(cleanedText);
          if (spec && Array.isArray(spec.elements)) {
            isSpec = true;
          }
        } catch (e) {
          // JSON parsing failed
        }

        if (isSpec) {
          console.log(`[SVG Generator] Successfully parsed JSON Spec. Rendering SVG...`);
          const svgString = renderSvgFromSpec(spec, accentHex);
          const base64Data = Buffer.from(svgString).toString('base64');
          return { dataUri: `data:image/svg+xml;base64,${base64Data}`, aspectRatio: 640 / 560 };
        }

        // Fallback: If model returned raw SVG instead of JSON, parse it directly
        if (cleanedText.startsWith("<svg")) {
          console.log(`[SVG Generator] Model returned direct freeform SVG instead of JSON spec.`);
          let aspectRatio = 680 / 400;
          const vbMatch = cleanedText.match(/viewBox\s*=\s*["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
          if (vbMatch) {
            const vbW = parseFloat(vbMatch[1]);
            const vbH = parseFloat(vbMatch[2]);
            if (vbW > 0 && vbH > 0) {
              aspectRatio = vbW / vbH;
            }
          }
          const base64Data = Buffer.from(cleanedText).toString('base64');
          return { dataUri: `data:image/svg+xml;base64,${base64Data}`, aspectRatio };
        }

        throw new Error("Returned content was neither a valid JSON spec nor a raw SVG string.");

      } catch (err) {
        clearTimeout(timeoutId);
        console.warn(`[SVG Generator] JSON Spec [Model: ${model}] [Attempt ${attempt}/${maxAttempts}] failed: ${err.message}`);

        if (model === "gemini-2.5-flash") {
          console.log(`[SVG Generator] Primary JSON spec model failed. Switching immediately to fallback model.`);
          break;
        }

        if (attempt < maxAttempts) {
          const delay = attempt * 1000 + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  // --- FALLBACK PATH: Freeform SVG ---
  console.log(`[SVG Generator] Spec generation path failed or timed out. Initiating freeform SVG fallback...`);
  const fallbackRemaining = deadline - Date.now();
  if (fallbackRemaining < 4000) {
    console.warn(`[SVG Generator] Skipping freeform SVG fallback — deadline nearly reached.`);
    return null;
  }

  const fallbackSystemPrompt = `You are a professional presentation graphic designer and software engineer.
Your task is to generate a clean, modern, and mathematically/technically accurate SVG diagram.
Rules:
1. Output ONLY valid, raw, well-formatted SVG code.
2. Start with <svg> and end with </svg>.
3. Do NOT wrap the output in markdown block code formatting (like \`\`\`xml or \`\`\`svg) or any other text. Return ONLY the SVG.
4. Ensure the SVG has a viewBox="0 0 680 400" and uses a white background.
5. All text labels must be large and readable (minimum 16px font-size) using a clean sans-serif font-family (e.g. System-UI, Inter, Arial).
6. Focus on ONE clear visual element only.`;

  const fallbackUserPrompt = `Generate a clean educational SVG diagram of: ${visualDescription || title || ""}. Focus on ONE clear visual element only. Large readable labels, minimum 16px text, white background, viewBox 680x400.`;

  const fallbackModel = "gemini-2.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(10000, fallbackRemaining - 1000));

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${fallbackSystemPrompt}\n\n${fallbackUserPrompt}` }] }],
        generationConfig: { temperature: 0.2 }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Fallback responded with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!contentText) {
      throw new Error("No SVG content returned from fallback.");
    }

    let cleanedText = contentText.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:xml|svg)?\n?/i, "").replace(/\n?```$/, "").trim();
    }

    if (!cleanedText.startsWith("<svg")) {
      throw new Error("Fallback content does not appear to be a valid SVG element.");
    }

    let aspectRatio = 680 / 400;
    const vbMatch = cleanedText.match(/viewBox\s*=\s*["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    if (vbMatch) {
      const vbW = parseFloat(vbMatch[1]);
      const vbH = parseFloat(vbMatch[2]);
      if (vbW > 0 && vbH > 0) {
        aspectRatio = vbW / vbH;
      }
    }

    console.log(`[SVG Generator] Successful freeform SVG fallback for: "${title}"`);
    const base64Data = Buffer.from(cleanedText).toString('base64');
    return { dataUri: `data:image/svg+xml;base64,${base64Data}`, aspectRatio };

  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[SVG Generator] Freeform SVG fallback failed: ${err.message}`);
    return null;
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
          const svgResult = await generateSvgFromGemini(s.title, s.visualDescription, deadline, accentHex);
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
          // Mathematically centre the image inside the region using its known
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
