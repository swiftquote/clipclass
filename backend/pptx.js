import pptxgen from 'pptxgenjs';

/**
 * Generates an image using Google Imagen and returns it as a Base64 data URI.
 *
 * @param {string} visualDescription - Slide image description text
 * @returns {Promise<string|null>} Base64 image data URI string, or null on failure
 */
async function generateImageFromImagen(visualDescription, visualType = 'photo', deadline = Infinity) {
  if (!visualDescription) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Image Generator] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict";
  const cleanDescription = visualDescription.trim().replace(/[.,;:!?]+$/, "");
  
  const stylePrefix = visualType === 'photo' 
    ? "A professional, high-resolution photograph of: "
    : "A professional digital graphic illustration of: ";
  const styleSuffix = visualType === 'photo'
    ? "Crisp focus, detailed composition, professional photography. Strictly no text, no labels, no words, no characters, no typography, no letters, no numbers. Pure visual design without annotations."
    : "Clean minimalist design, modern vector style, clear visual metaphor, high quality. Strictly no text, no labels, no words, no characters, no typography, no letters, no numbers. Pure visual design without annotations.";
  
  const finalPrompt = `${stylePrefix}${cleanDescription}. ${styleSuffix}`;

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
            personGeneration: "allow_adult"
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
 * ============================================================
 * SPEC-BASED DIAGRAM PIPELINE (replaces freeform SVG generation)
 * ============================================================
 * Freeform LLM-written SVG was unreliable: shapes drawn outside the viewBox
 * (clipped at card edges), tiny diagrams floating in empty canvas, rotated
 * labels, and overlapping geometry. Instead we ask Gemini for a constrained
 * JSON spec of primitives, then render the SVG ourselves with an auto-fit
 * transform — so the diagram ALWAYS fills the canvas and NOTHING can clip.
 */

const DIAGRAM_W = 640;
const DIAGRAM_H = 560; // ~matches the slide visual region's aspect ratio (5.6 x 4.9)

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders a validated diagram spec into an SVG string.
 * Auto-fits all geometry (including estimated label extents) into the canvas.
 */
function renderSpecToSvg(spec, accentHex = "2563EB") {
  const elements = Array.isArray(spec.elements) ? spec.elements : [];
  if (elements.length === 0) return null;

  const LABEL_FONT = 22;       // final on-canvas label size (never scaled with geometry)
  const PAD = 40;              // canvas margin so strokes/labels never touch edges

  // ---- 1. Collect every coordinate to compute the content bounding box ----
  const pts = [];
  const pushPt = (x, y) => {
    if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
      pts.push([x, y]);
    }
  };

  for (const el of elements) {
    switch (el.type) {
      case 'line':
      case 'arrow':
        pushPt(el.x1, el.y1); pushPt(el.x2, el.y2);
        break;
      case 'rect':
        pushPt(el.x, el.y); pushPt(el.x + (el.w || 0), el.y + (el.h || 0));
        break;
      case 'circle':
        pushPt((el.cx || 0) - (el.r || 0), (el.cy || 0) - (el.r || 0));
        pushPt((el.cx || 0) + (el.r || 0), (el.cy || 0) + (el.r || 0));
        break;
      case 'polygon':
        (el.points || []).forEach(p => pushPt(p[0], p[1]));
        break;
      case 'label':
        // Reserve approximate text extents so labels are part of the fit
        if (typeof el.x === 'number' && typeof el.y === 'number') {
          const tw = String(el.text || "").length * LABEL_FONT * 0.32;
          pushPt(el.x - tw, el.y - LABEL_FONT * 0.5);
          pushPt(el.x + tw, el.y + LABEL_FONT * 0.5);
        }
        break;
    }
  }

  if (pts.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);

  // ---- 2. Uniform scale + centre: geometry always fills the canvas ----
  const scale = Math.min((DIAGRAM_W - PAD * 2) / bw, (DIAGRAM_H - PAD * 2) / bh);
  const offX = (DIAGRAM_W - bw * scale) / 2 - minX * scale;
  const offY = (DIAGRAM_H - bh * scale) / 2 - minY * scale;
  const tx = (x) => +(x * scale + offX).toFixed(1);
  const ty = (y) => +(y * scale + offY).toFixed(1);

  const STROKE = "1F2937";
  const FILLS = { accent: accentHex, light: "DBEAFE", warm: "FDE68A", green: "BBF7D0", gray: "E5E7EB", none: "none" };
  const resolveFill = (f) => {
    if (!f || f === 'none') return 'none';
    if (FILLS[f]) return `#${FILLS[f]}`;
    if (/^#?[0-9A-Fa-f]{6}$/.test(f)) return f.startsWith('#') ? f : `#${f}`;
    return `#${FILLS.light}`;
  };

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DIAGRAM_W} ${DIAGRAM_H}" preserveAspectRatio="xMidYMid meet">`);
  parts.push(`<rect x="0" y="0" width="${DIAGRAM_W}" height="${DIAGRAM_H}" fill="#FFFFFF"/>`);
  parts.push(`<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#${STROKE}"/></marker></defs>`);

  // Shapes first, labels last (labels always on top, always horizontal)
  const labels = [];
  for (const el of elements) {
    switch (el.type) {
      case 'polygon': {
        const ptsStr = (el.points || []).map(p => `${tx(p[0])},${ty(p[1])}`).join(' ');
        if (ptsStr) parts.push(`<polygon points="${ptsStr}" fill="${resolveFill(el.fill || 'light')}" fill-opacity="0.85" stroke="#${STROKE}" stroke-width="3" stroke-linejoin="round"/>`);
        break;
      }
      case 'rect':
        parts.push(`<rect x="${tx(el.x)}" y="${ty(el.y)}" width="${(el.w * scale).toFixed(1)}" height="${(el.h * scale).toFixed(1)}" fill="${resolveFill(el.fill || 'light')}" fill-opacity="0.85" stroke="#${STROKE}" stroke-width="3"/>`);
        break;
      case 'circle':
        parts.push(`<circle cx="${tx(el.cx)}" cy="${ty(el.cy)}" r="${(el.r * scale).toFixed(1)}" fill="${resolveFill(el.fill || 'light')}" fill-opacity="0.85" stroke="#${STROKE}" stroke-width="3"/>`);
        break;
      case 'line':
        parts.push(`<line x1="${tx(el.x1)}" y1="${ty(el.y1)}" x2="${tx(el.x2)}" y2="${ty(el.y2)}" stroke="#${STROKE}" stroke-width="3" stroke-linecap="round"${el.dashed ? ' stroke-dasharray="8 6"' : ''}/>`);
        break;
      case 'arrow':
        parts.push(`<line x1="${tx(el.x1)}" y1="${ty(el.y1)}" x2="${tx(el.x2)}" y2="${ty(el.y2)}" stroke="#${STROKE}" stroke-width="3" stroke-linecap="round" marker-end="url(#arr)"/>`);
        break;
      case 'label':
        labels.push(el);
        break;
    }
  }

  for (const el of labels) {
    const txt = escapeXml(el.text || "");
    if (!txt) continue;
    const fx = tx(el.x);
    const fy = ty(el.y);
    // White halo behind text so labels stay readable over shapes
    parts.push(`<text x="${fx}" y="${fy}" font-family="Arial, Helvetica, sans-serif" font-size="${LABEL_FONT}" font-weight="${el.bold ? '700' : '500'}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" text-anchor="middle" dominant-baseline="middle">${txt}</text>`);
    parts.push(`<text x="${fx}" y="${fy}" font-family="Arial, Helvetica, sans-serif" font-size="${LABEL_FONT}" font-weight="${el.bold ? '700' : '500'}" fill="#${el.accent ? accentHex : STROKE}" text-anchor="middle" dominant-baseline="middle">${txt}</text>`);
  }

  parts.push(`</svg>`);
  return parts.join('');
}

/**
 * Asks Gemini for a constrained JSON diagram spec (NOT freeform SVG),
 * then renders it locally with guaranteed bounds.
 */
async function generateDiagramSpec(title, visualDescription, accentHex, deadline = Infinity) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Diagram Spec] Gemini API key (GEMINI_API_KEY) is missing.");
    return null;
  }

  const systemPrompt = `You are a precise technical diagram engineer. Output a diagram as a JSON spec of geometric primitives — NOT SVG code.

Coordinate system: x increases right, y increases DOWN (screen coordinates). Use any convenient scale (e.g. 0-100); the renderer auto-fits everything. Geometry must be mathematically correct (right angles must be exactly 90 degrees, proportions accurate).

Output ONLY a valid JSON object, no markdown:
{
  "elements": [
    { "type": "polygon", "points": [[x,y],[x,y],[x,y]], "fill": "light|warm|green|gray|accent|none" },
    { "type": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "fill": "light" },
    { "type": "circle", "cx": 0, "cy": 0, "r": 5, "fill": "warm" },
    { "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 10, "dashed": false },
    { "type": "arrow", "x1": 0, "y1": 0, "x2": 10, "y2": 10 },
    { "type": "label", "x": 5, "y": 5, "text": "short label", "bold": false, "accent": false }
  ]
}

STRICT RULES:
1. Maximum 14 elements. ONE clear diagram, no decoration, no titles inside the diagram.
2. Labels: max 3 words each, max 6 labels. Place each label OUTSIDE its shape, offset from edges/vertices so it never overlaps lines or other labels. "accent": true highlights the single most important label.
3. Shapes must not overlap unless the concept requires it (e.g. area comparisons).
4. Use distinct fills for distinct meanings.
5. For step/process flows: boxes left-to-right or top-to-bottom connected with arrows, label inside via a label element at the box center.
6. Double-check coordinate math before answering.`;

  const userPrompt = `Create a diagram spec for: ${visualDescription || title}`;

  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  for (const model of models) {
    const remainingBudget = deadline - Date.now();
    if (remainingBudget < 4000) {
      console.warn(`[Diagram Spec] Skipping ${model} — deadline nearly reached.`);
      return null;
    }
    const callTimeout = Math.min(18000, remainingBudget - 1000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), callTimeout);
    try {
      console.log(`[Diagram Spec] [${model}] Generating spec for: "${title}"...`);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 }
        })
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!contentText) throw new Error("Empty response");

      let cleaned = contentText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      }
      const spec = JSON.parse(cleaned);

      const svg = renderSpecToSvg(spec, accentHex);
      if (!svg) throw new Error("Spec produced no renderable geometry");

      const base64Data = Buffer.from(svg).toString('base64');
      console.log(`[Diagram Spec] [${model}] Rendered ${spec.elements.length}-element diagram for "${title}".`);
      return { dataUri: `data:image/svg+xml;base64,${base64Data}`, aspectRatio: DIAGRAM_W / DIAGRAM_H };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[Diagram Spec] [${model}] failed: ${err.message}`);
    }
  }

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
  const maxRetries = 2;

  for (const model of models) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Respect the global generation deadline
      const remainingBudget = deadline - Date.now();
      if (remainingBudget < 4000) {
        console.warn(`[SVG Generator] Skipping ${model} attempt ${attempt} — deadline nearly reached.`);
        return null;
      }
      const callTimeout = Math.min(15000, remainingBudget - 1000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), callTimeout);

      try {
        console.log(`[SVG Generator] [Model: ${model}] [Attempt ${attempt}/${maxRetries}] Generating SVG for: "${title}"...`);
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

        // Parse the real viewBox so the slide compiler can centre the diagram
        // with the correct aspect ratio (the model doesn't always honour 680x400).
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
        console.warn(`[SVG Generator] [Model: ${model}] [Attempt ${attempt}/${maxRetries}] failed: ${err.message}`);
        
        if (attempt < maxRetries) {
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
          // Primary: constrained JSON spec rendered locally (never clips, always fills canvas).
          // Fallback: legacy freeform SVG generation.
          let result = await generateDiagramSpec(s.title, s.visualDescription, accentHex, deadline);
          if (!result) {
            result = await generateSvgFromGemini(s.title, s.visualDescription, deadline);
          }
          if (result) {
            s.imageBase64 = result.dataUri;
            s.imageAspectRatio = result.aspectRatio;
          } else {
            s.imageBase64 = null;
          }
        })());
      } else {
        visualPromises.push((async () => {
          if (currentDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, currentDelay));
          }
          s.imageBase64 = await generateImageFromImagen(s.visualDescription, s.visualType, deadline);
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

      case 'key_terms': {
        // Section Header (38pt, bold, accent colour)
        slide.addText(s.title || "Key Vocabulary", {
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

        if (s.bullets && s.bullets.length > 0) {
          const listItems = [];
          s.bullets.forEach((bullet, bIdx) => {
            let term = "";
            let definition = "";
            
            // Try to split on ":" or "-"
            const match = bullet.match(/^([^:-]+)[:\-](.+)$/);
            if (match) {
              term = match[1].trim();
              definition = match[2].trim();
            } else {
              definition = bullet.trim();
            }

            if (term) {
              listItems.push({
                text: term + ": ",
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: accentHex, bold: true, bullet: true, lineSpacing: 32 }
              });
              listItems.push({
                text: definition + (bIdx < s.bullets.length - 1 ? "\n" : ""),
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bold: false }
              });
            } else {
              listItems.push({
                text: definition + (bIdx < s.bullets.length - 1 ? "\n" : ""),
                options: { fontSize: 22, fontFace: FONT_FAMILY, color: TEXT_COLOR, bold: false, bullet: true, lineSpacing: 32 }
              });
            }
          });

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
      }

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
