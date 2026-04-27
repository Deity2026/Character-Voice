// Character Detection & Voice Matching Engine
// This is the core of the patent: Character Voice DNA profiling

import type { InsertCharacter, InsertVoiceProfile, InsertDialogueSegment } from "@shared/schema";

// Well-known character database for voice matching.
// All entries below are drawn from PUBLIC DOMAIN works to avoid any
// copyright or right-of-publicity exposure.
const WELL_KNOWN_CHARACTERS: Record<string, {
  description: string;
  age: string;
  gender: string;
  accent: string;
  personality: string;
  voiceTone: string;
  voiceProfile: Partial<InsertVoiceProfile>;
}> = {
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
  "captain ahab": {
    description: "Grizzled, obsessive whaling captain with a peg leg and burning intensity",
    age: "elderly", gender: "male", accent: "American", personality: "obsessive, commanding, vengeful",
    voiceTone: "gravelly, thunderous, fervent",
    voiceProfile: { pitch: 0.7, rate: 0.9, voiceType: "deep", accentStyle: "american-old", emotionalBaseline: "hostile", resonance: "booming", ageMarker: "elderly" }
  },
  "ishmael": {
    description: "Thoughtful young sailor and narrator, observant and philosophical",
    age: "young", gender: "male", accent: "American", personality: "reflective, curious, steady",
    voiceTone: "calm, thoughtful, measured",
    voiceProfile: { pitch: 1.0, rate: 0.95, voiceType: "warm", accentStyle: "american-neutral", emotionalBaseline: "calm", resonance: "medium", ageMarker: "young-adult" }
  },
  "jane eyre": {
    description: "Plain but spirited young governess with deep moral conviction",
    age: "young", gender: "female", accent: "British", personality: "principled, independent, quietly strong",
    voiceTone: "clear, earnest, composed",
    voiceProfile: { pitch: 1.1, rate: 1.0, voiceType: "clear", accentStyle: "british", emotionalBaseline: "determined", resonance: "medium", ageMarker: "young-adult" }
  },
  "mr. rochester": {
    description: "Brooding, world-weary master of Thornfield Hall",
    age: "middle-aged", gender: "male", accent: "British", personality: "sardonic, intense, conflicted",
    voiceTone: "deep, brooding, edged",
    voiceProfile: { pitch: 0.8, rate: 0.95, voiceType: "deep", accentStyle: "british-formal", emotionalBaseline: "neutral", resonance: "full", ageMarker: "adult" }
  },
  "tom sawyer": {
    description: "Mischievous American boy with a knack for trouble and adventure",
    age: "young", gender: "male", accent: "American-Southern", personality: "clever, playful, daring",
    voiceTone: "bright, cheeky, energetic",
    voiceProfile: { pitch: 1.2, rate: 1.1, voiceType: "youthful", accentStyle: "american-southern", emotionalBaseline: "cheerful", resonance: "thin", ageMarker: "young" }
  },
  "huckleberry finn": {
    description: "Ragged, free-spirited boy of the Mississippi, plain-spoken and wise beyond his years",
    age: "young", gender: "male", accent: "American-Southern", personality: "independent, honest, observant",
    voiceTone: "laconic, plainspoken, warm",
    voiceProfile: { pitch: 1.1, rate: 0.95, voiceType: "warm", accentStyle: "american-southern", emotionalBaseline: "calm", resonance: "medium", ageMarker: "young" }
  },
  "hercule poirot": {
    description: "Fastidious Belgian detective with a waxed moustache and exacting manner",
    age: "middle-aged", gender: "male", accent: "Belgian-French", personality: "meticulous, vain, brilliant",
    voiceTone: "precise, lilting, refined",
    voiceProfile: { pitch: 0.95, rate: 1.0, voiceType: "sharp", accentStyle: "belgian-french", emotionalBaseline: "neutral", resonance: "medium", ageMarker: "adult" }
  },
  "long john silver": {
    description: "One-legged sea cook turned pirate, charming and cunning in equal measure",
    age: "middle-aged", gender: "male", accent: "British-West-Country", personality: "charismatic, cunning, dangerous",
    voiceTone: "booming, jovial, weathered",
    voiceProfile: { pitch: 0.8, rate: 0.95, voiceType: "deep", accentStyle: "british-west-country", emotionalBaseline: "cheerful", resonance: "booming", ageMarker: "adult" }
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

    // Common adverbs and filler words after dialogue tags — strip from character names
    const STRIP_WORDS = new Set(["gravely","kindly","firmly","softly","loudly","quietly","angrily","sadly","happily","nervously","excitedly","calmly","coldly","warmly","sharply","gently","eagerly","wearily","briskly","carelessly","uncertainly","sheepishly","disapprovingly","cheerfully","thoughtfully","sarcastically","proudly","haughtily","bitterly","fiercely","grimly","lazily","dreamily","impatiently","desperately","frantically","furiously","abruptly","reluctantly","doubtfully","matter-of-factly","mildly","dryly","joyfully","brightly","in","with","at","to","from","disbelief","disgust","surprise","horror","delight","anger","amusement","excitement","wonder","relief","alarm","nearly","almost","falling","turning","looking","peering","stepping","rising","replied","returned","cried"]);

    // Words that can never be character names by themselves — pronouns, articles, common verbs.
    // These can appear as the word right after "said" (e.g., "said his wife" / "replied she").
    const NON_NAMES = new Set(["he","she","it","they","we","i","you","his","her","hers","him","its","their","theirs","them","our","ours","my","mine","your","yours","the","a","an","this","that","these","those","is","was","were","be","been","being","and","but","or","so","as","of","if","then","there","here","now","who","what","when","where","why","how","sir","madam","miss","lord","lady","mr","mrs","ms","dr"]);

    // Find dialogue with attribution patterns
    // Pattern: "dialogue" said/asked/replied/whispered CharacterName adverb?
    // Speaker pattern allows titles like Mr., Mrs., Dr., Ms., St. plus 1-2 following name parts
    const SPEAKER_PATTERN = String.raw`(?:Mr\.|Mrs\.|Ms\.|Dr\.|St\.|Mr|Mrs|Ms|Dr|Lord|Lady|Sir|Miss|Captain|Father|Mother|Aunt|Uncle)?\s*\w+(?:\s+\w+){0,2}`;
    const dialoguePattern = new RegExp(`[""\u201C]([^""\u201D]+)[""\u201D]\\s*(?:,?\\s*(?:said|asked|replied|whispered|shouted|exclaimed|murmured|called|cried|answered|snapped|muttered|growled|sighed|laughed|screamed|yelled|demanded|pleaded|begged|suggested|warned|announced|declared|explained|interrupted|continued|added|agreed|argued|insisted|protested|admitted|confessed|boasted|complained|grumbled|grunted|hissed|roared|bellowed|stammered|stuttered|gasped|returned|observed|remarked))\\s+(${SPEAKER_PATTERN})`, "gi");

    // Also pattern: CharacterName said, "dialogue"
    const dialoguePattern2 = new RegExp(`(${SPEAKER_PATTERN})\\s+(?:said|asked|replied|whispered|shouted|exclaimed|murmured|called)\\s*,?\\s*[""\u201C]([^""\u201D]+)[""\u201D]`, "gi");

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
      // Strip trailing adverbs/fillers from speaker name (e.g., "Dumbledore gravely" -> "Dumbledore")
      const speakerWords = speaker.split(/\s+/);
      // Only keep first word(s) that look like proper names (capitalized), strip rest
      const cleanedWords: string[] = [];
      for (const w of speakerWords) {
        if (STRIP_WORDS.has(w.toLowerCase())) continue;
        // If word starts lowercase and isn't the first word, it's probably not a name
        if (cleanedWords.length > 0 && w[0] === w[0].toLowerCase()) continue;
        cleanedWords.push(w);
      }
      const cleanSpeaker = cleanedWords.length > 0 ? cleanedWords.join(" ") : speakerWords[0];
      // Title-case each word (preserves "Mr.", "Mrs.", etc., and capitalizes proper names)
      const normalizedSpeaker = cleanSpeaker.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

      // Skip if the resulting "speaker" is just a pronoun or non-name word (e.g., "His", "She")
      // — leave the segment as unattributed dialogue rather than inventing a fake character.
      if (NON_NAMES.has(normalizedSpeaker.toLowerCase()) || normalizedSpeaker.length < 2) {
        // Treat the whole match as just dialogue with no speaker.
        if (match.index > lastEnd) {
          const narration = para.substring(lastEnd, match.index).trim();
          if (narration.length > 0) {
            segments.push({
              bookId, characterId: null, chapterIndex, segmentIndex: segmentIndex++,
              text: narration, isDialogue: false, isNarration: true,
              emotionalContext: detectEmotion(narration, surrounding),
              surroundingContext: surrounding.substring(0, 200),
            });
          }
        }
        segments.push({
          bookId, characterId: null, chapterIndex, segmentIndex: segmentIndex++,
          text: dialogue, isDialogue: true, isNarration: false,
          emotionalContext: detectEmotion(dialogue, surrounding),
          surroundingContext: surrounding.substring(0, 200),
        });
        lastEnd = match.index + match[0].length;
        continue;
      }

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

// Common English-language first names by gender. Used as a strong signal
// when honorific titles aren't present (e.g., "Harry" -> male, "Hermione" -> female).
const MALE_FIRST_NAMES = new Set([
  "harry","ron","albus","severus","sirius","remus","draco","neville","fred","george",
  "percy","bill","charlie","arthur","vernon","dudley","hagrid","dobby","tom","viktor",
  "cedric","oliver","seamus","dean","colin","justin","ernie","michael","david","john",
  "james","robert","william","richard","edward","henry","charles","george","thomas",
  "frank","peter","paul","mark","luke","matthew","andrew","daniel","alexander",
  "frodo","samwise","gandalf","aragorn","legolas","gimli","boromir","sherlock",
  "john","hercule","ahab","ishmael","darcy","bingley","wickham","collins","jack",
  "david","jim","bob","steve","mike","chris","tony","sam","ben","adam","alex","max",
  "liam","noah","ethan","lucas","mason","logan","jacob","jackson","aiden","owen",
  "caleb","isaac","nathan","ryan","connor","hunter","eli","jonah","theo","oscar","leo"
]);
const FEMALE_FIRST_NAMES = new Set([
  "hermione","ginny","luna","lily","petunia","minerva","molly","fleur","cho","lavender",
  "parvati","padma","angelina","katie","nymphadora","tonks","pomona","rolanda","poppy",
  "narcissa","bellatrix","andromeda","rita","dolores","rosmerta","sybill",
  "elizabeth","jane","mary","lydia","kitty","catherine","caroline","georgiana","emma",
  "olivia","sophia","ava","isabella","mia","charlotte","amelia","harper","evelyn",
  "abigail","emily","madison","avery","ella","scarlett","grace","chloe","victoria",
  "riley","aria","lily","layla","nora","hazel","violet","aurora","savannah","audrey",
  "brooklyn","bella","claire","skylar","lucy","paisley","everly","anna","caroline",
  "sarah","rachel","laura","karen","susan","linda","barbara","deborah","michelle",
  "jennifer","jessica","amanda","melissa","nicole","kimberly","angela","helen",
  "alice","diana","clara","rose","daisy","ivy","poppy","eve","ruby","pearl","belle",
  "galadriel","arwen","eowyn","rosie","juliet","ophelia","cordelia","miranda"
]);

// Detect British/UK style speech patterns and vocabulary
function detectBritishStyle(nameContext: string): boolean {
  const britishMarkers = [
    /\bcolour\b/, /\bbloody\b/, /\bbloke\b/, /\bmate\b/, /\bblimey\b/, /\bbrilliant\b/,
    /\bcheers\b/, /\bquite\b/, /\brather\b/, /\bjolly\b/, /\bproper\b/,
    /\bnoughts\b/, /\bfortnight\b/, /\bwhilst\b/, /\bamongst\b/,
    /\bmum\b/, /\bmummy\b/, /\bdaddy\b/, /\bgran\b/, /\bnan\b/,
    /\blift\b/, /\bflat\b/, /\blorry\b/, /\bbiscuit\b/, /\bjumper\b/,
    /\bschool\s+robe/, /\bhogwarts\b/, /\bdiagon\b/, /\blondon\b/, /\bengland\b/,
    /\bthe\s+ministry\b/, /\bthe\s+queen\b/, /\bbritish\b/, /\benglish\b/,
    /\bsir\s+\w+/, /\blord\s+\w+/, /\blady\s+\w+/
  ];
  return britishMarkers.some(p => p.test(nameContext));
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

  // ----- Gender inference -----
  let gender = "unknown";

  // 1) Honorific title in the name itself
  const lowerName = name.toLowerCase();
  if (/\b(mr\.?|sir|lord|captain|father|uncle|king|prince|duke|baron|brother|sergeant|colonel|major|general|professor|dr\.?|doctor)\b/.test(lowerName)) {
    gender = "male";
  } else if (/\b(mrs\.?|ms\.?|miss|madam|madame|lady|aunt|queen|princess|duchess|baroness|sister|mother)\b/.test(lowerName)) {
    gender = "female";
  }

  // 2) First-name lookup (covers "Harry", "Hermione", "Elizabeth", etc.)
  if (gender === "unknown") {
    const firstWord = lowerName.replace(/\.|,/g, "").split(/\s+/)[0] || "";
    if (MALE_FIRST_NAMES.has(firstWord)) gender = "male";
    else if (FEMALE_FIRST_NAMES.has(firstWord)) gender = "female";
  }

  // 3) Pronoun co-occurrence (existing heuristic) — lower threshold so it bites
  if (gender === "unknown") {
    const heCount = (nameContext.match(/\bhe\b|\bhis\b|\bhim\b/g) || []).length;
    const sheCount = (nameContext.match(/\bshe\b|\bher\b|\bhers\b/g) || []).length;
    if (heCount > sheCount) gender = "male";
    else if (sheCount > heCount) gender = "female";
  }

  // ----- Age inference -----
  let age = "adult";
  if (/\b(?:old|elderly|aged|ancient|grey-haired|gray-haired|white-haired|wrinkled|grandfather|grandmother|grandpa|grandma)\b/.test(nameContext)) age = "elderly";
  else if (/\b(?:young|boy|girl|child|kid|teen|teenager|youth|first-year|second-year|third-year|fourth-year)\b/.test(nameContext)) age = "young";

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

  // ----- Accent inference -----
  let accent = "neutral";
  if (detectBritishStyle(nameContext) || detectBritishStyle(lowerText.substring(0, 5000))) {
    accent = "British";
  }

  return {
    description: `Character from the text. ${gender !== "unknown" ? `Appears to be ${gender}.` : ""} ${age !== "adult" ? `Appears ${age}.` : ""}`,
    age,
    gender,
    accent,
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

// Demo text for showcasing the app — drawn from PUBLIC DOMAIN works only.
// Uses Pride and Prejudice (Jane Austen, 1813) — fully public domain.
export const DEMO_BOOK_TEXT = `Chapter 1

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she, briskly. "For Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do not you want to know who has taken it?" cried his wife, impatiently.

"You want to tell me, and I have no objection to hearing it."

This was invitation enough.

"Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England," exclaimed Mrs. Bennet, excitedly. "That he came down on Monday in a chaise and four to see the place, and was so much delighted with it that he agreed with Mr. Morris immediately."

"What is his name?" asked Mr. Bennet, calmly.

"Bingley," replied Mrs. Bennet, eagerly.

"Is he married or single?"

"Oh! single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!" announced Mrs. Bennet, proudly.

"How so? how can it affect them?" asked Mr. Bennet, dryly.

"My dear Mr. Bennet," replied his wife, sharply, "how can you be so tiresome! You must know that I am thinking of his marrying one of them."

"Is that his design in settling here?" asked Mr. Bennet, sarcastically.

"Design! nonsense, how can you talk so!" exclaimed Mrs. Bennet, impatiently. "But it is very likely that he may fall in love with one of them, and therefore you must visit him as soon as he comes."

Elizabeth Bennet listened to the conversation from the next room and could not help smiling.

"I do not see the occasion for that," said Elizabeth, calmly, stepping into the parlour. "You and the girls may go, or you may send them by themselves, which perhaps will be still better; for as you are as handsome as any of them, Mr. Bingley might like you the best of the party."

"My dear, you flatter me," replied Mrs. Bennet, warmly. "I certainly have had my share of beauty, but I do not pretend to be anything extraordinary now."

Chapter 2

Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last assuring his wife that he should not go.

"What an excellent father you have, girls!" said Mrs. Bennet, joyfully, when at last she discovered the truth. "I do not know how you will ever make him amends for his kindness."

"I am sure I shall be very glad to see Mr. Bingley," said Elizabeth, brightly.

"Tomorrow we shall have an opportunity of doing so at the assembly," added Mr. Bennet, mildly. "I think we may all spare ourselves the trouble of further discussion until then."`;

export const DEMO_BOOK_TITLE = "Pride and Prejudice — Demo Excerpt";
export const DEMO_BOOK_AUTHOR = "Jane Austen (Public Domain)";
