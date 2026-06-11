import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { compilePresentation } from './pptx.js';

dotenv.config();

async function runLocalTest() {
  console.log("==================================================");
  console.log("🧪 Testing PowerPoint Generation & Styling (Local Offline)...");
  console.log("==================================================");


  const mockSlidesJSON = {
    "slides": [
      {
        "type": "title",
        "title": "Electing a President: Understanding the Electoral College",
        "subtitle": "High School Social Studies"
      },
      {
        "type": "objectives",
        "title": "Learning Objectives",
        "bullets": [
          "Explain the purpose and origin of the Electoral College system.",
          "Describe how electoral votes are allocated to states and the winning threshold.",
          "Analyze the 'winner-take-all' system and its impact on presidential elections.",
          "Evaluate the main arguments for and against the Electoral College."
        ]
      },
      {
        "type": "agenda",
        "title": "Lesson Roadmap",
        "bullets": [
          "1. Hook & Warmup",
          "2. Key Concepts & Factual Lessons",
          "3. Real-world Examples",
          "4. Interactive Challenge",
          "5. Consolidation & Takeaways"
        ]
      },
      {
        "type": "key_terms",
        "title": "Key Vocabulary",
        "bullets": [
          "Electoral College: A body of electors chosen to elect the President and Vice President.",
          "Elector: A person selected to cast a vote in the Electoral College.",
          "Popular Vote: The total number of individual votes cast by citizens in an election.",
          "Swing State: A state where the political parties have similar levels of support."
        ],
        "notes": "Here are the key vocabulary terms we will encounter in today's lesson. Please write them down in your notebooks."
      },
      {
        "type": "content",
        "title": "The Electoral College was created as a constitutional compromise between Congress and the popular vote.",
        "bullets": [
          "US presidential election system",
          "Established by Article II",
          "Compromise between methods",
          "Popular vote vs. Congressional vote"
        ],
        "visualDescription": "A historical illustration depicting the Constitutional Convention delegates debating the presidential election process.",
        "imageSearchPhrase": "Constitutional Convention 1787 painting",
        "visualType": "photo",
        "notes": "Good morning, class! [Pacing: 1 min] Today, we're diving into a core part of American democracy: the Electoral College. ..."
      },
      {
        "type": "content",
        "title": "Each state's electoral votes are determined by its total representation in Congress.",
        "bullets": [
          "Electors based on representation",
          "Two senators per state",
          "House representatives count",
          "538 total electors, 270 to win"
        ],
        "visualDescription": "An infographic map of the United States, with each state clearly labeled and displaying its current number of electoral votes.",
        "imageSearchPhrase": "United States Capitol building photo",
        "visualType": "photo",
        "notes": "[Pacing: 2 mins] So, how many electors does each state get? It's directly tied to their representation in Congress. Ever..."
      },
      {
        "type": "content",
        "title": "Most states award all their electoral votes to the candidate who wins the state's popular vote.",
        "bullets": [
          "Winner-take-all system",
          "State popular vote majority",
          "All electoral votes awarded",
          "Maine and Nebraska exceptions"
        ],
        "visualDescription": "An animated graphic showing a U.S. state map. As a candidate 'wins' a state's popular vote, the entire state turns that color.",
        "imageSearchPhrase": "voting ballot box election",
        "visualType": "photo",
        "notes": "[Pacing: 2.5 mins] This is a crucial aspect: the 'winner-take-all' system. In 48 out of 50 states, if a candidate wins..."
      },
      {
        "type": "content",
        "title": "The system is highly debated because a candidate can win the popular vote but lose the presidency.",
        "bullets": [
          "Critics call the system undemocratic",
          "Mismatches occurred in 2000 and 2016",
          "Proponents argue it preserves federalism",
          "Prevents candidates from ignoring small states"
        ],
        "visualDescription": "A concept diagram showing two scales balancing: Popular Vote on the left versus the Electoral College on the right.",
        "imageSearchPhrase": "supercalifragilisticexpialidocious nonexistent search query",
        "visualType": "diagram",
        "notes": "[Pacing: 3 mins] This is the core analytical concept. It will trigger the fallback SVG diagram generation since no image will be found."
      },
      {
        "type": "content",
        "title": "Campaign efforts concentrate heavily on key swing states.",
        "bullets": [
          "Candidates focus on purple states",
          "Safe states are largely ignored",
          "Winner-take-all amplifies swing power",
          "Small margin shifts decide winner"
        ],
        "visualDescription": "A map highlighting swing states like Pennsylvania and Michigan in purple.",
        "imageSearchPhrase": "swing states campaign cat",
        "visualType": "photo",
        "notes": "[Pacing: 2.5 mins] This search query matches general cat photos on Wikimedia Commons, but they will be rejected by the relevance check, triggering our custom SVG diagram instead."
      },
      {
        "type": "interactive",
        "title": "Check Your Understanding: Electoral Votes",
        "question": "How many electoral votes are needed to win the presidency?",
        "options": ["A) 270 votes", "B) 538 votes", "C) 100 votes", "D) 435 votes"],
        "correctAnswer": "A) 270 votes",
        "notes": "Teacher notes directing the check for understanding."
      },
      {
        "type": "summary",
        "title": "Summary of Takeaways",
        "bullets": [
          "Electoral College is a constitutional compromise.",
          "Electors based on Congressional representation.",
          "Most states use 'winner-take-all' system.",
          "Debate exists over its democratic fairness."
        ],
        "notes": "Teacher directions to close and consolidate the lesson."
      }
    ]
  };

  try {
    console.log("Compiling slides JSON into a PPTX presentation file...");
    const pptxBuffer = await compilePresentation(mockSlidesJSON, "Cobalt Blue");
    
    // Save to the brain artifact directory
    const artifactFolder = "/Users/mohammedismail/.gemini/antigravity-ide/brain/19c37cef-f876-4afd-a9a2-e67ee518a48c";
    const filename = "ClipClass_Presentation_krIeObyk8ac.pptx";
    const outputPath = path.join(artifactFolder, filename);
    
    fs.writeFileSync(outputPath, pptxBuffer);
    console.log(`\n📂 Successfully compiled slide deck: ${outputPath} (${pptxBuffer.length} bytes)`);

    // Copy to Downloads folder as requested
    const downloadsPath = "/Users/mohammedismail/Downloads/ClipClass_Presentation_krIeObyk8ac.pptx";
    fs.copyFileSync(outputPath, downloadsPath);
    console.log(`📂 Copied PowerPoint presentation to Downloads: ${downloadsPath}`);
    console.log("==================================================");

  } catch (err) {
    console.error("\n❌ PowerPoint generation test failed!");
    console.error(err);
    console.log("==================================================");
  }
}

runLocalTest();
