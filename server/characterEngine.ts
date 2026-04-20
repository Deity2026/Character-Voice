// Character Detection & Voice Matching Engine
// This is the core of the patent: Character Voice DNA profiling

import type { InsertCharacter, InsertVoiceProfile, InsertDialogueSegment } from "@shared/schema";

// Well-known character database for voice matching
const WELL_KNOWN_CHARACTERS: Record<string, {
  description: string;
  age: string;
  gender: string;
  accent: string;
  personality: string;
  voiceTone: string;
  voiceProfile: Partial<InsertVoiceProfile>;
}> = {
  "harry potter": {
    description: "Young British wizard with round glasses and a lightning scar",
    age: "young", gender: "male", accent: "British", personality: "brave, loyal, determined",
    voiceTone: "youthful, earnest",
    voiceProfile: { pitch: 1.05, rate: 1.0, voiceType: "youthful", accentStyle: "british", emotionalBaseline: "determined", resonance: "medium", ageMarker: "young-adult" }
  },
  "dumbledore": {
    description: "Elderly wizard headmaster with long silver beard and half-moon spectacles",
    age: "elderly", gender: "male", accent: "British", personality: "wise, calm, mysterious",
    voiceTone: "deep, gentle, wise",
    voiceProfile: { pitch: 0.75, rate: 0.85, voiceType: "deep", accentStyle: "british-formal", emotionalBaseline: "calm", resonance: "full", ageMarker: "elderly" }
  },
  "hermione": {
    description: "Brilliant young witch with bushy brown hair, top of her class",
    age: "young", gender: "female", accent: "British", personality: "intelligent, assertive, caring",
    voiceTone: "clear, precise, confident",
    voiceProfile: { pitch: 1.15, rate: 1.1, voiceType: "clear", accentStyle: "british", emotionalBaseline: "energetic", resonance: "medium", ageMarker: "young-adult" }
  },
  "ron": {
    description: "Tall, gangly red-haired wizard, loyal friend with a big family",
    age: "young", gender: "male", accent: "British", personality: "humorous, loyal, insecure",
    voiceTone: "warm, casual, slightly nervous",
    voiceProfile: { pitch: 0.95, rate: 1.05, voiceType: "warm", accentStyle: "british-casual", emotionalBaseline: "cheerful", resonance: "medium", ageMarker: "young-adult" }
  },
  "gandalf": {
    description: "Ancient wizard in grey robes with a long white beard and staff",
    age: "elderly", gender: "male", accent: "British", personality: "wise, commanding, humorous",
    voiceTone: "deep, authoritative, grandfatherly",
    voiceProfile: { pitch: 0.7, rate: 0.8, voiceType: "deep", accentStyle: "british-formal", emotionalBaseline: "calm", resonance: "booming", ageMarker: "elderly" }
  },
  "frodo": {
    description: "Small hobbit with curly hair, carrying the One Ring",
    age: "young", gender: "male", accent: "British", personality: "brave, compassionate, burdened",
    voiceTone: "soft, earnest, gentle",
    voiceProfile: { pitch: 1.1, rate: 0.95, voiceType: "soft", accentStyle: "british-rural", emotionalBaseline: "calm", resonance: "thin", ageMarker: "young-adult" }
  },
  "sherlock holmes": {
    description: "Brilliant detective with sharp features and piercing eyes",
    age: "middle-aged", gender: "male", accent: "British", personality: "analytical, eccentric, intense",
    voiceTone: "sharp, rapid, precise",
    voiceProfile: { pitch: 0.9, rate: 1.2, voiceType: "sharp", accentStyle: "british-formal", emotionalBaseline: "neutral", resonance: "medium", ageMarker: "adult" }
  },
  "watson": {
    description: "Loyal doctor and companion, steady and reliable",
    age: "middle-aged", gender: "male", accent: "British", personality: "loyal, practical, warm",
    voiceTone: "warm, steady, conversational",
    voiceProfile: { pitch: 0.95, rate: 0.95, voiceType: "warm", accentStyle: "british", emotionalBaseline: "calm", resonance: "medium", ageMarker: "adult" }
  },
  "elizabeth bennet": {
    description: "Witty and intelligent young woman, second of five sisters",
    age: "young", gender: "female", accent: "British", personality: "witty, independent, spirited",
    voiceTone: "lively, articulate, playful",
    voiceProfile: { pitch: 1.15, rate: 1.05, voiceType: "bright", accentStyle: "british-refined", emotionalBaseline: "cheerful", resonance: "medium", ageMarker: "young-adult" }
  },
  "darcy": {
    description: "Tall, handsome wealthy gentleman, initially proud and reserved",
    age: "young", gender: "male", accent: "British", personality: "proud, honorable, reserved",
    voiceTone: "deep, measured, formal",
    voiceProfile: { pitch: 0.8, rate: 0.9, voiceType: "deep", accentStyle: "british-aristocratic", emotionalBaseline: "neutral", resonance: "full", ageMarker: "adult" }
  },
};

// Color palette for character tags
const CHARACTER_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16", "#a855f7",
  "#14b8a6", "#e11d48", "#3b82f6", "#eab308", "#22c55e",
];

interface ParsedDialogue {
  text: string;
  speaker: string | null;
  isDialogue: boolean;
  emotionalContext: string;
  surroundingContext: string;
}

// Detect emotional context from surrounding text
function detectEmotion(text: string, surrounding: string): string {
  const combined = (text + " " + surrounding).toLowerCase();
  if (/scream|shout|yell|fury|rage|angry|furious/.test(combined)) return "angry";
  if (/whisper|quiet|softly|murmur|hushed/.test(combined)) return "whispered";
  if (/laugh|giggle|chuckle|grin|smile|joy|happy/.test(combined)) return "happy";
  if (/cry|sob|tear|weep|sad|mourn|grief/.test(combined)) return "sad";
  if (/tremble|shake|fear|scared|terrif|horror/.test(combined)) return "scared";
  if (/sigh|tired|weary|exhaust/.test(combined)) return "weary";
  if (/exclaim|excit|thrill|eager/.test(combined)) return "excited";
  if (/snarl|hiss|sneer|bitter|venom/.test(combined)) return "hostile";
  if (/wonder|amaz|awe|marvel/.test(combined)) return "awed";
  if (/sarcas|iron|dry|mock/.test(combined)) return "sarcastic";
  return "neutral";
}

// Parse text into dialogue segments with speaker attribution
export function parseTextIntoSegments(text: string, bookId: number): {
  segments: InsertDialogueSegment[];
  detectedCharacters: Map<string, { count: number; descriptions: string[] }>;
} {
  const segments: InsertDialogueSegment[] = [];
  const detectedCharacters = new Map<string, { count: number; descriptions: string[] }>();

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  let segmentIndex = 0;
  let chapterIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();

    // Detect chapter breaks
    if (/^(chapter|part)\s+\d+/i.test(para) || /^(chapter|part)\s+[IVXLC]+/i.test(para)) {
      chapterIndex++;
      continue;
    }

    // Find dialogue with attribution patterns
    // Pattern: "dialogue" said/asked/replied/whispered CharacterName
    const dialoguePattern = /[""\u201C]([^""\u201D]+)[""\u201D]\s*(?:,?\s*(?:said|asked|replied|whispered|shouted|exclaimed|murmured|called|cried|answered|snapped|muttered|growled|sighed|laughed|screamed|yelled|demanded|pleaded|begged|suggested|warned|announced|declared|explained|interrupted|continued|added|agreed|argued|insisted|protested|admitted|confessed|boasted|complained|grumbled|grunted|hissed|roared|bellowed|stammered|stuttered|gasped))\s+(\w+(?:\s+\w+)?)/gi;

    // Also pattern: CharacterName said, "dialogue"
    const dialoguePattern2 = /(\w+(?:\s+\w+)?)\s+(?:said|asked|replied|whispered|shouted|exclaimed|murmured|called)\s*,?\s*[""\u201C]([^""\u201D]+)[""\u201D]/gi;

    let hasDialogue = false;
    const surrounding = paragraphs.slice(Math.max(0, i - 1), Math.min(paragraphs.length, i + 2)).join(" ");

    // Try pattern 1: "dialogue" said Character
    let match;
    let lastEnd = 0;
    const regex1 = new RegExp(dialoguePattern.source, "gi");

    while ((match = regex1.exec(para)) !== null) {
      hasDialogue = true;
      const dialogue = match[1];
      const speaker = match[2].trim();
      const normalizedSpeaker = speaker.charAt(0).toUpperCase() + speaker.slice(1).toLowerCase();

      // Add narration before this dialogue if any
      if (match.index > lastEnd) {
        const narration = para.substring(lastEnd, match.index).trim();
        if (narration.length > 0) {
          segments.push({
            bookId,
            characterId: null,
            chapterIndex,
            segmentIndex: segmentIndex++,
            text: narration,
            isDialogue: false,
            isNarration: true,
            emotionalContext: detectEmotion(narration, surrounding),
            surroundingContext: surrounding.substring(0, 200),
          });
        }
      }

      // Track character
      const charData = detectedCharacters.get(normalizedSpeaker) || { count: 0, descriptions: [] };
      charData.count++;
      detectedCharacters.set(normalizedSpeaker, charData);

      segments.push({
        bookId,
        characterId: null, // Will be linked after character creation
        chapterIndex,
        segmentIndex: segmentIndex++,
        text: dialogue,
        isDialogue: true,
        isNarration: false,
        emotionalContext: detectEmotion(dialogue, surrounding),
        surroundingContext: surrounding.substring(0, 200),
      });

      lastEnd = match.index + match[0].length;
    }

    // If no dialogue found, add as narration
    if (!hasDialogue) {
      // Check for simple quoted text
      const simpleQuotes = para.match(/[""\u201C]([^""\u201D]+)[""\u201D]/g);
      if (simpleQuotes && simpleQuotes.length > 0) {
        // Has quotes but no clear attribution — still mark as dialogue
        segments.push({
          bookId,
          characterId: null,
          chapterIndex,
          segmentIndex: segmentIndex++,
          text: para,
          isDialogue: true,
          isNarration: false,
          emotionalContext: detectEmotion(para, surrounding),
          surroundingContext: surrounding.substring(0, 200),
        });
      } else {
        segments.push({
          bookId,
          characterId: null,
          chapterIndex,
          segmentIndex: segmentIndex++,
          text: para,
          isDialogue: false,
          isNarration: true,
          emotionalContext: detectEmotion(para, surrounding),
          surroundingContext: surrounding.substring(0, 200),
        });
      }
    } else if (lastEnd < para.length) {
      // Remaining narration after last dialogue
      const remaining = para.substring(lastEnd).trim();
      if (remaining.length > 0) {
        segments.push({
          bookId,
          characterId: null,
          chapterIndex,
          segmentIndex: segmentIndex++,
          text: remaining,
          isDialogue: false,
          isNarration: true,
          emotionalContext: detectEmotion(remaining, surrounding),
          surroundingContext: surrounding.substring(0, 200),
        });
      }
    }
  }

  return { segments, detectedCharacters };
}

// Build Character Voice DNA profiles
export function buildCharacterProfiles(
  detectedCharacters: Map<string, { count: number; descriptions: string[] }>,
  bookId: number,
  fullText: string
): { characters: InsertCharacter[]; voiceProfiles: Map<string, InsertVoiceProfile> } {
  const result: InsertCharacter[] = [];
  const profiles = new Map<string, InsertVoiceProfile>();
  let colorIndex = 0;

  for (const [name, data] of detectedCharacters) {
    // Check if this is a well-known character
    const lowerName = name.toLowerCase();
    const wellKnown = Object.entries(WELL_KNOWN_CHARACTERS).find(([key]) =>
      lowerName.includes(key) || key.includes(lowerName)
    );

    // Extract character descriptions from text
    const descriptionFromText = extractCharacterDescription(name, fullText);

    if (wellKnown) {
      const [key, wkData] = wellKnown;
      result.push({
        bookId,
        name,
        description: wkData.description + (descriptionFromText ? `. From text: ${descriptionFromText}` : ""),
        age: wkData.age,
        gender: wkData.gender,
        accent: wkData.accent,
        personality: wkData.personality,
        voiceTone: wkData.voiceTone,
        isWellKnown: true,
        wellKnownReference: `Well-known character: ${key}`,
        dialogueCount: data.count,
        voiceProfileId: null,
        colorTag: CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length],
      });

      profiles.set(name, {
        characterId: 0, // placeholder, will be set after insert
        ...wkData.voiceProfile,
        synthesisParams: JSON.stringify(wkData.voiceProfile),
      } as InsertVoiceProfile);
    } else {
      // Infer character traits from text context
      const inferred = inferCharacterTraits(name, fullText);

      result.push({
        bookId,
        name,
        description: descriptionFromText || inferred.description,
        age: inferred.age,
        gender: inferred.gender,
        accent: inferred.accent,
        personality: inferred.personality,
        voiceTone: inferred.voiceTone,
        isWellKnown: false,
        wellKnownReference: null,
        dialogueCount: data.count,
        voiceProfileId: null,
        colorTag: CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length],
      });

      profiles.set(name, generateVoiceProfile(inferred));
    }

    colorIndex++;
  }

  return { characters: result, voiceProfiles: profiles };
}

// Extract character descriptions from surrounding text
function extractCharacterDescription(name: string, text: string): string | null {
  const patterns = [
    new RegExp(`${name}[,]?\\s+(?:a|an|the)\\s+([^.]{10,100})\\.`, "i"),
    new RegExp(`${name}\\s+(?:was|is|had|has|wore|looked|appeared)\\s+([^.]{10,100})\\.`, "i"),
    new RegExp(`(?:tall|short|young|old|elderly|beautiful|handsome)\\s+(?:\\w+\\s+){0,3}${name}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].substring(0, 200);
  }
  return null;
}

// Infer character traits from text analysis
function inferCharacterTraits(name: string, text: string): {
  description: string;
  age: string;
  gender: string;
  accent: string;
  personality: string;
  voiceTone: string;
} {
  const lowerText = text.toLowerCase();
  const nameContext = getNameContext(name, lowerText);

  // Gender inference
  let gender = "unknown";
  const heCount = (nameContext.match(/\bhe\b|\bhis\b|\bhim\b/g) || []).length;
  const sheCount = (nameContext.match(/\bshe\b|\bher\b|\bhers\b/g) || []).length;
  if (heCount > sheCount + 2) gender = "male";
  else if (sheCount > heCount + 2) gender = "female";

  // Age inference
  let age = "adult";
  if (/\b(?:old|elderly|aged|ancient|grey-haired|white-haired|grandfather|grandmother)\b/.test(nameContext)) age = "elderly";
  else if (/\b(?:young|boy|girl|child|kid|teen|teenager|youth)\b/.test(nameContext)) age = "young";

  // Personality inference
  const personalityTraits: string[] = [];
  if (/\b(?:brave|courag|hero|fearless)\b/.test(nameContext)) personalityTraits.push("brave");
  if (/\b(?:wise|wisdom|knowledge|learned)\b/.test(nameContext)) personalityTraits.push("wise");
  if (/\b(?:kind|gentle|caring|compassion)\b/.test(nameContext)) personalityTraits.push("kind");
  if (/\b(?:stern|strict|harsh|severe)\b/.test(nameContext)) personalityTraits.push("stern");
  if (/\b(?:funny|humor|laugh|joke|wit)\b/.test(nameContext)) personalityTraits.push("humorous");
  if (/\b(?:cunning|clever|sly|crafty)\b/.test(nameContext)) personalityTraits.push("cunning");

  const personality = personalityTraits.length > 0 ? personalityTraits.join(", ") : "determined";

  // Voice tone based on inferred traits
  let voiceTone = "neutral";
  if (age === "elderly") voiceTone = gender === "female" ? "warm, gentle, weathered" : "deep, measured, wise";
  else if (age === "young") voiceTone = gender === "female" ? "bright, energetic, clear" : "youthful, earnest";
  else voiceTone = gender === "female" ? "clear, confident" : "steady, resonant";

  return {
    description: `Character from the text. ${gender !== "unknown" ? `Appears to be ${gender}.` : ""} ${age !== "adult" ? `Appears ${age}.` : ""}`,
    age,
    gender,
    accent: "neutral",
    personality,
    voiceTone,
  };
}

// Get text surrounding a character name
function getNameContext(name: string, text: string): string {
  const chunks: string[] = [];
  const regex = new RegExp(`[^.]*\\b${name.toLowerCase()}\\b[^.]*\\.`, "gi");
  let match;
  let count = 0;
  while ((match = regex.exec(text)) !== null && count < 20) {
    chunks.push(match[0]);
    count++;
  }
  return chunks.join(" ");
}

// Generate voice profile from inferred traits
function generateVoiceProfile(traits: {
  age: string;
  gender: string;
  voiceTone: string;
  personality: string;
}): InsertVoiceProfile {
  let pitch = 1.0;
  let rate = 1.0;
  let resonance = "medium";
  let ageMarker = "adult";
  let voiceType = "default";
  let emotionalBaseline = "neutral";

  // Age adjustments
  if (traits.age === "elderly") {
    pitch *= 0.85;
    rate *= 0.85;
    resonance = "full";
    ageMarker = "elderly";
    voiceType = "deep";
  } else if (traits.age === "young") {
    pitch *= 1.1;
    rate *= 1.05;
    ageMarker = "young-adult";
    voiceType = "youthful";
  }

  // Gender adjustments
  if (traits.gender === "female") {
    pitch *= 1.15;
    voiceType = traits.age === "elderly" ? "warm" : "clear";
  } else if (traits.gender === "male") {
    pitch *= 0.9;
    if (traits.age !== "young") voiceType = "deep";
  }

  // Personality adjustments
  if (traits.personality.includes("brave")) emotionalBaseline = "determined";
  if (traits.personality.includes("wise")) { rate *= 0.9; emotionalBaseline = "calm"; }
  if (traits.personality.includes("humorous")) emotionalBaseline = "cheerful";
  if (traits.personality.includes("stern")) { emotionalBaseline = "neutral"; resonance = "full"; }

  return {
    characterId: 0,
    pitch: Math.round(pitch * 100) / 100,
    rate: Math.round(rate * 100) / 100,
    volume: 1.0,
    voiceType,
    accentStyle: "neutral",
    emotionalBaseline,
    breathiness: traits.age === "elderly" ? 0.5 : 0.3,
    resonance,
    ageMarker,
    synthesisParams: JSON.stringify({ pitch, rate, voiceType, resonance, ageMarker }),
  };
}

// Demo text for showcasing the app
export const DEMO_BOOK_TEXT = `Chapter 1: The Boy Who Lived

Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much. They were the last people you'd expect to be involved in anything strange or mysterious, because they just didn't hold with such nonsense.

"I heard the Potters' son — Harry — arrived at Hogwarts this year," said Dumbledore gravely.

"You don't mean — you can't mean the people who live —" gasped Hermione, staring at the letter.

"My dear Professor, I've never seen a cat sit so stiffly," said Dumbledore kindly.

"I would trust Hagrid with my life," said Dumbledore firmly.

"Famous before he can walk and talk!" exclaimed Hermione in disbelief. "Famous for something he won't even remember!"

Harry felt his face go red. He stammered nervously.

"I — I didn't know," whispered Harry. "I didn't know I was famous."

"Wicked!" shouted Ron in excitement. "You're really Harry Potter?"

"Everyone thinks I'm special," said Harry gloomily. "All these people in the pub, shaking my hand — but I don't know anything about magic at all."

"Don't worry," said Hermione briskly. "I've read all our course books, and I think you'll do fine. There's so much to learn, isn't there?"

"Now, I must ask you," said Dumbledore, peering over his half-moon spectacles, "did anything peculiar happen on the way here?"

"A snake talked to me at the zoo," said Harry sheepishly.

"A snake!" exclaimed Ron, nearly falling off his seat. "Brilliant!"

Hermione rolled her eyes. "Honestly, Ronald," she said disapprovingly. "A snake talking to a wizard is a sign of a very rare and potentially dangerous ability."

Chapter 2: The Journey Begins

The morning sun cast long shadows across the grounds of Hogwarts School of Witchcraft and Wizardry. The ancient castle stood tall against the grey sky, its towers reaching toward the clouds like stone fingers.

"I still can't believe we're actually here," whispered Ron, gazing up at the enchanted ceiling of the Great Hall.

"It's bewitched to look like the sky outside," said Hermione matter-of-factly. "I read about it in Hogwarts: A History."

Harry smiled at his new friends. For the first time in his life, he felt like he truly belonged somewhere.

"Welcome, welcome to another year at Hogwarts!" announced Dumbledore, rising from his golden chair. His voice carried effortlessly across the vast hall. "Before we begin our feast, I would like to say a few words. And here they are: Nitwit! Blubber! Oddment! Tweak!"

"Is he a bit mad?" asked Harry uncertainly, turning to Ron.

"Mad?" said Ron carelessly. "He's a genius! Best wizard in the world! But he is a bit mad, yes."`;

export const DEMO_BOOK_TITLE = "Harry Potter — Demo Excerpt";
export const DEMO_BOOK_AUTHOR = "Demo (Character Voice Showcase)";
