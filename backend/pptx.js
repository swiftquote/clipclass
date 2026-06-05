import pptxgen from 'pptxgenjs';

/**
 * Helper to fetch any direct image URL and convert it to a Base64 data URI.
 * Includes a timeout to prevent hanging.
 * 
 * @param {string} url - Direct image URL to fetch
 * @returns {Promise<string|null>} Base64 image data URI string, or null on failure
 */
async function fetchImageFromUrlAsBase64(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout limit

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ClipClassEducationalApp/1.0 (mismail17.308@gmail.com)'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Returned invalid content-type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`[Image Fetch Url] Error fetching from ${url}:`, err.message);
    return null;
  }
}

/**
 * Local heuristic relevance check: returns true if the image filename or URL
 * contains at least one descriptive word from the search phrase.
 * Filters out common stop words like "painting", "photo", "diagram", etc.
 * 
 * @param {string} imageTitleOrUrl - Target filename or URL to check
 * @param {string} searchPhrase - Descriptive search phrase
 * @returns {boolean} True if the image is relevant, false otherwise
 */
export function isImageRelevant(imageTitleOrUrl, searchPhrase) {
  if (!imageTitleOrUrl || !searchPhrase) return false;

  const cleanTarget = decodeURIComponent(imageTitleOrUrl).toLowerCase();

  // Stop words to exclude from matching
  const stopWords = new Set([
    'painting', 'photo', 'photograph', 'diagram', 'illustration', 
    'image', 'picture', 'drawing', 'the', 'a', 'an', 'of', 'and', 
    'in', 'on', 'with', 'for', 'at', 'by', 'from', 'to'
  ]);
  
  // Extract clean keywords from search phrase
  const keywords = searchPhrase
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !stopWords.has(w)); // Only words longer than 2 characters and not stop words

  if (keywords.length === 0) return true; // Accept by default if no matching keywords remain

  // Verify if at least one keyword is contained in the target filename/url
  const matches = keywords.some(kw => cleanTarget.includes(kw));
  if (!matches) {
    console.log(`[Relevance Check] Rejected "${imageTitleOrUrl}" for query "${searchPhrase}". Keywords missing: [${keywords.join(', ')}]`);
  } else {
    console.log(`[Relevance Check] Accepted "${imageTitleOrUrl}" for query "${searchPhrase}".`);
  }
  return matches;
}

/**
 * Searches Wikimedia Commons for files matching the search phrase, returns the first raster image.
 * 
 * @param {string} phrase - Descriptive search phrase
 * @returns {Promise<string|null>} Base64 image data URI, or null on failure
 */
async function fetchFromWikimedia(phrase) {
  if (!phrase) return null;
  
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(phrase)}&gsrnamespace=6&prop=imageinfo&iiprop=url&gsrlimit=5`;
  console.log(`[Wikimedia Fetch] Searching Commons for: "${phrase}"`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s API search timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ClipClassEducationalApp/1.0 (mismail17.308@gmail.com)'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Wikimedia API responded with status ${response.status}`);
    }

    const data = await response.json();
    if (data.query && data.query.pages) {
      const pages = Object.values(data.query.pages);
      for (const p of pages) {
        if (p.imageinfo && p.imageinfo[0] && p.imageinfo[0].url) {
          const fileUrl = p.imageinfo[0].url;
          // Filter to only accept common raster image types (.jpg, .jpeg, .png)
          if (/\.(jpe?g|png)$/i.test(fileUrl)) {
            // Relevance Check
            if (isImageRelevant(fileUrl, phrase)) {
              console.log(`[Wikimedia Fetch] Found candidate image: ${fileUrl}`);
              const base64 = await fetchImageFromUrlAsBase64(fileUrl);
              if (base64) {
                return base64;
              }
            }
          }
        }
      }
    }
    console.log(`[Wikimedia Fetch] No matching raster images found for: "${phrase}"`);
    return null;
  } catch (err) {
    console.error(`[Wikimedia Fetch] Error searching for "${phrase}":`, err.message);
    return null;
  }
}

/**
 * Searches Unsplash API for photos matching the search phrase.
 * Requires UNSPLASH_ACCESS_KEY or UNSPLASH_CLIENT_ID to be set in environment variables.
 * 
 * @param {string} phrase - Descriptive search phrase
 * @returns {Promise<string|null>} Base64 image data URI, or null on failure
 */
async function fetchFromUnsplash(phrase) {
  if (!phrase) return null;

  const accessKey = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_CLIENT_ID;
  if (!accessKey) {
    console.log(`[Unsplash Fetch] Skipping search. No UNSPLASH_ACCESS_KEY found in environment.`);
    return null;
  }

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(phrase)}&per_page=5`;
  console.log(`[Unsplash Fetch] Querying Unsplash API for: "${phrase}"`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s API search timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
        'User-Agent': 'ClipClassEducationalApp/1.0 (mismail17.308@gmail.com)'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Unsplash API responded with status ${response.status}`);
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      for (const item of data.results) {
        const imageUrl = item.urls?.regular || item.urls?.small;
        if (imageUrl) {
          // Relevance Check
          if (isImageRelevant(imageUrl, phrase)) {
            console.log(`[Unsplash Fetch] Found candidate photo: ${imageUrl}`);
            const base64 = await fetchImageFromUrlAsBase64(imageUrl);
            if (base64) {
              return base64;
            }
          }
        }
      }
    }
    console.log(`[Unsplash Fetch] No photos found on Unsplash for: "${phrase}"`);
    return null;
  } catch (err) {
    console.error(`[Unsplash Fetch] Error querying for "${phrase}":`, err.message);
    return null;
  }
}

/**
 * Generates a beautiful vector SVG diagram card matching the slide topic.
 * Uses the custom presentation accent color for cohesive styling.
 * 
 * @param {string} title - Slide title
 * @param {string} description - Diagram visual description
 * @param {string} accentHex - Accent theme color hex code
 * @returns {string} Base64 SVG data URI
 */
function generateSVGDiagram(title, description, accentHex) {
  // XML escaping helper
  const escapeXML = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const cleanTitle = escapeXML(title || 'Educational Concept');
  const cleanDesc = escapeXML(description || '');

  // Wrap description text into lines of ~40 characters for visual layout
  const words = cleanDesc.split(' ');
  const lines = [];
  let currentLine = '';
  for (const w of words) {
    if ((currentLine + ' ' + w).length > 40) {
      lines.push(currentLine);
      currentLine = w;
    } else {
      currentLine = currentLine ? currentLine + ' ' + w : w;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  const displayLines = lines.slice(0, 4); // Show up to 4 lines in the diagram card

  // Generate SVG code
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FAFAF8" />
      <stop offset="100%" stop-color="#F1F5F9" />
    </linearGradient>
    
    <!-- Accent Color Gradients -->
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#${accentHex}" />
      <stop offset="100%" stop-color="#${accentHex}BB" />
    </linearGradient>
    
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#1E293B" flood-opacity="0.1" />
    </filter>
  </defs>

  <!-- Outer Card Frame -->
  <rect x="20" y="20" width="760" height="560" rx="28" fill="url(#bgGrad)" stroke="#${accentHex}" stroke-width="4" filter="url(#shadow)" />
  
  <!-- Subtle Grid Blueprint Grid -->
  <pattern id="blueprintGrid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E2E8F0" stroke-width="1.5" />
  </pattern>
  <rect x="30" y="30" width="740" height="540" rx="22" fill="url(#blueprintGrid)" opacity="0.6" />

  <!-- Diagram Nodes Graphics (Stylized Concept Flow) -->
  <g transform="translate(400, 210)">
    <!-- Central Node -->
    <circle cx="0" cy="0" r="55" fill="url(#accentGrad)" filter="url(#shadow)" />
    <circle cx="0" cy="0" r="48" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="6,4" />
    
    <!-- Left Input Node -->
    <circle cx="-160" cy="0" r="42" fill="#FFFFFF" stroke="#${accentHex}" stroke-width="3" filter="url(#shadow)" />
    <path d="M -160 -15 L -160 15 M -175 0 L -145 0" stroke="#${accentHex}" stroke-width="4" stroke-linecap="round" />
    
    <!-- Right Output Node -->
    <circle cx="160" cy="0" r="42" fill="#FFFFFF" stroke="#${accentHex}" stroke-width="3" filter="url(#shadow)" />
    <!-- Checkmark icon inside right node -->
    <path d="M 148 0 L 156 8 L 172 -8" fill="none" stroke="#${accentHex}" stroke-width="5" stroke-linecap="round" stroke-linecap="round" />

    <!-- Connecting Arrows -->
    <!-- Left to Center Arrow -->
    <path d="M -105 0 L -70 0" fill="none" stroke="#${accentHex}" stroke-width="5" stroke-linecap="round" />
    <path d="M -73 -8 L -65 0 L -73 8" fill="none" stroke="#${accentHex}" stroke-width="5" stroke-linecap="round" stroke-linecap="round" />

    <!-- Center to Right Arrow -->
    <path d="M 70 0 L 105 0" fill="none" stroke="#${accentHex}" stroke-width="5" stroke-linecap="round" />
    <path d="M 102 -8 L 110 0 L 102 8" fill="none" stroke="#${accentHex}" stroke-width="5" stroke-linecap="round" stroke-linecap="round" />
    
    <!-- Decorative orbits -->
    <path d="M -220 -80 Q 0 -140 220 -80" fill="none" stroke="#${accentHex}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.5" />
    <path d="M -220 80 Q 0 140 220 80" fill="none" stroke="#${accentHex}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.5" />
  </g>

  <!-- Title / Central Concept Text -->
  <text x="400" y="420" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" font-size="28" font-weight="800" fill="#1A1A1A" text-anchor="middle">
    ${cleanTitle}
  </text>

  <!-- Multi-line description mapping inside SVG -->
  ${displayLines.map((line, idx) => `
    <text x="400" y="${470 + (idx * 26)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" font-size="16" font-weight="600" fill="#64748B" text-anchor="middle">
      ${line}
    </text>
  `).join('')}
</svg>`;

  const base64 = Buffer.from(svg).toString('base64');
  console.log(`[SVG Diagram] Generated vector diagram for: "${title}" (${base64.length} bytes)`);
  return `data:image/svg+xml;base64,${base64}`;
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

  // Fetch images concurrently for content slides using the fallback chain:
  // Wikimedia Commons -> Unsplash API -> Generated SVG Diagram
  const imagePromises = slides.map(async (s) => {
    if (s.type === 'content') {
      const phrase = s.imageSearchPhrase || s.imageKeywords;
      let base64 = null;

      // Step 1: Wikimedia Commons First
      if (phrase) {
        base64 = await fetchFromWikimedia(phrase);
      }

      // Step 2: Unsplash API Second
      if (!base64 && phrase) {
        base64 = await fetchFromUnsplash(phrase);
      }

      // Step 3: Dynamically Generated SVG Diagram Third
      if (!base64) {
        base64 = generateSVGDiagram(s.title, s.visualDescription, accentHex);
      }

      s.imageBase64 = base64;
    }
  });
  await Promise.all(imagePromises);

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

          // Text caption below the image
          slide.addText(s.visualDescription || "", {
            x: 5.1,
            y: 4.25,
            w: 4.3,
            h: 0.9,
            fontSize: 11,
            italic: true,
            color: "64748B", // Slate-500
            fontFace: FONT_FAMILY,
            align: 'center',
            valign: 'top'
          });
        } else {
          // Right Column: Fallback Visual Evidence Card (when image fetch fails)
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
        }
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
