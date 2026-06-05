import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { generatePowerpointContent } from './ai.js';
import { compilePresentation } from './pptx.js';

dotenv.config();

async function runTest() {
  console.log("==================================================");
  console.log("🧪 Testing PowerPoint Generation & Styling...");
  console.log("==================================================");

  const mockSegments = [
    { time: "00:05", text: "Qatar, a small but resource-rich nation in the Persian Gulf, has leveraged its vast wealth, primarily from natural gas reserves, to establish a significant presence on the global stage. This economic power extends beyond traditional diplomacy and trade, deeply intertwining with its strategic investments in various international sectors. The intersection of Qatar's financial might and its engagement with global media entities presents a complex landscape, raising critical questions about influence, editorial independence, and the role of state-backed capital in shaping public discourse and international perceptions." },
    { time: "02:15", text: "A key aspect of Qatar's global strategy involves substantial financial investments in media organizations. This approach is often seen as a component of its soft power initiatives, aiming to enhance its international standing and project its national interests. Such investments can take various forms, from direct ownership of news networks to funding cultural and educational media projects. The scale of these financial commitments allows Qatar to cultivate media platforms with significant reach, enabling it to participate actively in global information flows and potentially influence narratives surrounding regional and international events." },
    { time: "04:30", text: "The involvement of state funding in media operations inherently introduces a debate surrounding journalistic ethics and editorial autonomy. Critics often raise concerns about potential conflicts of interest, where the financial backing of a government could subtly or overtly influence content, coverage priorities, or the framing of sensitive topics. The challenge lies in maintaining perceived and actual independence, ensuring that editorial decisions are driven solely by journalistic principles rather than the political or economic agendas of the funding state. This tension is central to understanding the dynamics of state-backed media." },
    { time: "07:00", text: "Al Jazeera Media Network stands as a prominent example of Qatar's investment in global media. Launched in 1996, it rapidly grew into a major international news broadcaster, particularly influential in the Arab world and beyond. While Al Jazeera English has often been lauded for its independent reporting and alternative perspectives, particularly on issues affecting the Global South, it has also faced scrutiny and criticism regarding its coverage of specific regional conflicts, internal Qatari affairs, and its perceived alignment with Qatari foreign policy objectives. These instances highlight the ongoing debate about the network's editorial independence despite its stated mission." },
    { time: "09:15", text: "The ongoing discussion surrounding Qatar's financial involvement in media underscores a broader global challenge concerning media ownership, transparency, and the integrity of information. It compels audiences to critically evaluate the sources of their news and consider the potential influences, both overt and subtle, that may shape content. Ultimately, the debate about Qatar, money, and media is a microcosm of the larger struggle to maintain journalistic independence and foster an informed global citizenry in an increasingly interconnected and financially complex media landscape, where state and corporate interests frequently intersect with the pursuit of truth." }
  ];

  try {
    console.log("Calling generatePowerpointContent to synthesize slide JSON...");
    const slidesJSON = await generatePowerpointContent({
      timedSegments: mockSegments,
      ageGroup: "14-16",
      theme: "Royal Purple"
    });

    console.log("\n✅ AI Slide JSON Synthesis Succeeded!");
    console.log(`Received ${slidesJSON.slides?.length} slides.`);
    
    // Print slide outline structure to verify pedagogical rules
    console.log("\n--- Slide Outline Structure ---");
    slidesJSON.slides.forEach((s, idx) => {
      console.log(`[Slide ${idx + 1}] Type: ${s.type}`);
      console.log(`   Header: "${s.title || s.question || 'No Title'}"`);
      if (s.bullets) console.log(`   Bullets count: ${s.bullets.length}`);
      if (s.visualDescription) console.log(`   Visual: "${s.visualDescription.substring(0, 80)}..."`);
      if (s.notes) console.log(`   Speaker Notes: "${s.notes.substring(0, 100).replace(/\n/g, ' ')}..."`);
      console.log("");
    });
    console.log("---------------------------------\n");

    // Perform verification of the guidelines
    console.log("Verifying Cognitive Load and Assertion-Evidence structure...");
    let passedChecks = true;
    
    slidesJSON.slides.forEach((s, idx) => {
      if (s.type === 'content') {
        if (!s.title.endsWith('.') && !s.title.endsWith('?') && !s.title.endsWith('!')) {
          console.warn(`⚠️ Warning: Slide ${idx + 1} header might not be a full-sentence assertion claim.`);
          passedChecks = false;
        }
        if (s.bullets && s.bullets.length > 4) {
          console.error(`❌ Error: Slide ${idx + 1} has ${s.bullets.length} bullets, which exceeds the max cap of 4.`);
          passedChecks = false;
        }
      }
    });

    if (passedChecks) {
      console.log("✨ All slide structural layout checks PASSED!");
    }

    console.log("\nCompiling slides JSON into a PPTX presentation file...");
    const pptxBuffer = await compilePresentation(slidesJSON, "Royal Purple");
    
    const outputFilename = "test_presentation.pptx";
    const outputPath = path.resolve(outputFilename);
    fs.writeFileSync(outputPath, pptxBuffer);
    console.log(`\n📂 Successfully compiled slide deck: ${outputPath} (${pptxBuffer.length} bytes)`);
    console.log("==================================================");

  } catch (err) {
    console.error("\n❌ PowerPoint generation test failed!");
    console.error(err);
    console.log("==================================================");
  }
}

runTest();
