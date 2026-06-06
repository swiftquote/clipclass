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
  
  // Extract clean keywords from search phrase and stem them
  const keywords = searchPhrase
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !stopWords.has(w))
    .map(w => {
      // Suffix-stripping stemmer
      let stem = w
        .replace(/(?:ing|ed|es|s|al|ic|tion|ment|able|y|ive|ful|less|ness)$/g, '')
        .replace(/e$/g, '');
      return stem.length >= 3 ? stem : w; // fallback to original word if stem is too short
    });

  if (keywords.length === 0) return true; // Accept by default if no matching keywords remain

  // Verify if at least one keyword stem is contained in the target filename/url (or its 4-character prefix)
  const matches = keywords.some(kw => {
    if (cleanTarget.includes(kw)) return true;
    if (kw.length >= 4) {
      const prefix = kw.slice(0, 4);
      if (cleanTarget.includes(prefix)) return true;
    }
    return false;
  });

  if (!matches) {
    console.log(`[Relevance Check] Rejected "${imageTitleOrUrl}" for query "${searchPhrase}". Keywords stems: [${keywords.join(', ')}]`);
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
 * Call Gemini to dynamically synthesize an educational SVG diagram.
 * 
 * @param {string} slideTitle - Title of the slide
 * @param {string} imageDescription - Detailed visual description of the diagram
 * @returns {Promise<string|null>} Base64 SVG data URI string, or null on failure
 */
async function generateSvgFromGemini(slideTitle, imageDescription) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here' || apiKey === '') {
    console.error("[SVG Generator] Gemini API key is missing or not configured.");
    return null;
  }

  const systemPrompt = `You are an SVG diagram generator for educational PowerPoint slides.

Generate clean, valid SVG code for the following diagram:

DESCRIPTION: ${imageDescription}
SLIDE TITLE: ${slideTitle}

Requirements:
- viewBox="0 0 680 400" (adjust height to fit content)
- White background, transparent outer container
- Primary accent colour: #3B5BDB (blue)
- Secondary colour: #F59F00 (amber) for data cells/values
- Use red #E03131 only for negative/wrong indicators
- Font: sans-serif, minimum 13px, all labels clearly readable
- Include a title label and clear annotations
- Use simple rectangles, lines, arrows and text only
- No clipPath, no filters, no gradients, no images
- Every text element must have a fill colour set explicitly
- Arrows: draw as lines with a small triangle or chevron end
- Return ONLY the raw SVG code. 
  No explanation, no markdown, no backticks.`;

  const candidateModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError = null;
  let totalAttempts = 0;
  const maxAttempts = 3;

  for (const modelName of candidateModels) {
    if (totalAttempts >= maxAttempts) break;

    let modelDone = false;
    while (totalAttempts < maxAttempts && !modelDone) {
      totalAttempts++;
      try {
        console.log(`[SVG Generator] Attempting SVG generation using model: ${modelName} (attempt ${totalAttempts}/${maxAttempts})...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s strict timeout

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
                    text: systemPrompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.15
            }
          })
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          console.warn(`[SVG Generator] Model ${modelName} rate limited (429) on attempt ${totalAttempts}/${maxAttempts}.`);
          if (totalAttempts < maxAttempts) {
            console.log(`[SVG Generator] Waiting 8000ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, 8000));
            continue;
          }
          throw new Error(`Model ${modelName} rate limited (429)`);
        }

        if (response.status === 503) {
          console.warn(`[SVG Generator] Model ${modelName} service unavailable (503) on attempt ${totalAttempts}/${maxAttempts}.`);
          if (totalAttempts < maxAttempts) {
            console.log(`[SVG Generator] Waiting 5000ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          throw new Error(`Model ${modelName} service unavailable (503)`);
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Model ${modelName} responded with status ${response.status}: ${errText}`);
        }

        const result = await response.json();
        let contentText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!contentText) {
          throw new Error(`Model ${modelName} did not return content text.`);
        }

        // Clean the SVG response to ensure no markdown wraps or trailing explanation remains
        let cleanSvg = contentText.trim();
        
        // Remove markdown code blocks if generated
        if (cleanSvg.includes("```")) {
          // Extract content between backticks
          cleanSvg = cleanSvg.replace(/^```(?:xml|svg|html)?\n([\s\S]*?)\n```$/i, '$1');
          // Final fallback to clean remaining backticks
          cleanSvg = cleanSvg.replace(/```/g, '').trim();
        }

        // If it doesn't start with '<svg', find first '<svg' in the response
        if (!cleanSvg.startsWith("<svg")) {
          const svgStartIdx = cleanSvg.indexOf("<svg");
          if (svgStartIdx !== -1) {
            cleanSvg = cleanSvg.substring(svgStartIdx);
          }
        }

        // If it has trailing text after '</svg>', truncate it
        const svgEndIdx = cleanSvg.lastIndexOf("</svg>");
        if (svgEndIdx !== -1) {
          cleanSvg = cleanSvg.substring(0, svgEndIdx + 6);
        }

        // Verify that we actually have a valid-looking SVG tag
        if (!cleanSvg.startsWith("<svg") || !cleanSvg.endsWith("</svg>")) {
          throw new Error("Generated content does not resemble a valid SVG document structure.");
        }

        console.log(`[SVG Generator] Successfully generated and parsed SVG diagram (${cleanSvg.length} characters)`);
        const base64 = Buffer.from(cleanSvg).toString('base64');
        return `data:image/svg+xml;base64,${base64}`;

      } catch (err) {
        console.warn(`[SVG Generator] Model ${modelName} attempt ${totalAttempts} failed: ${err.message}.`);
        lastError = err;
        modelDone = true;
      }
    }
  }

  console.error(`[SVG Generator] All models failed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
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

  // Fetch images/diagrams sequentially to avoid rate-limiting (429s) on Gemini free tier:
  let geminiCallCount = 0;
  for (const s of slides) {
    if (s.type === 'content') {
      const phrase = s.imageSearchPhrase || s.imageKeywords;
      let base64 = null;

      if (s.visualType === 'diagram') {
        // "diagram" -> skip Wikimedia/Unsplash entirely, go straight to SVG generation
        console.log(`[Slide Visual Route] Slide "${s.title}" is a diagram. Generating SVG...`);
        if (geminiCallCount > 0) {
          console.log("[SVG Generator] Delaying 1200ms to respect rate limit...");
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
        base64 = await generateSvgFromGemini(s.title, s.visualDescription);
        geminiCallCount++;
      } else {
        // "photo" (or default) -> run the Wikimedia -> Unsplash chain
        console.log(`[Slide Visual Route] Slide "${s.title}" is a photo. Searching online...`);
        
        // Step 1: Wikimedia Commons First
        if (phrase) {
          base64 = await fetchFromWikimedia(phrase);
        }

        // Step 2: Unsplash API Second
        if (!base64 && phrase) {
          base64 = await fetchFromUnsplash(phrase);
        }
      }

      s.imageBase64 = base64;
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

          // 7. Place Title / Central Concept and Description/Caption below nodes
          slide.addText([
            { text: (s.title || "Concept Flow") + "\n\n", options: { bold: true, fontSize: 12, color: TEXT_COLOR, fontFace: FONT_FAMILY } },
            { text: s.visualDescription || "Diagram detailing key concept dynamics.", options: { fontSize: 11, color: "475569", fontFace: FONT_FAMILY, italic: true } }
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
