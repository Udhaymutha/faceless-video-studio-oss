import type {
  NarrationEmotion,
  NarrationPace,
  NarrationPunctuationMode,
  NarrationWorkspaceState,
  TtsModelId,
  VoiceProfile,
} from "../types/narration";

export const TTS_MODELS: Array<{
  id: TtsModelId;
  label: string;
  description: string;
}> = [
  {
    id: "gemini-3.8-flash-tts",
    label: "Expressive Director (Gemini 3.8 Flash TTS)",
    description:
      "Full emotional range, whispers, bold emphasis & vocal cues (<breath>, <gasp>, <sigh>).",
  },
  {
    id: "gemini-3.8-flash-lite-tts",
    label: "Fast Standard (Gemini 3.8 Flash Lite TTS)",
    description:
      "Low-latency high-throughput narration ideal for rapid drafts and long scripts.",
  },
];

export const NARRATION_PACE_OPTIONS: Array<{
  id: NarrationPace;
  label: string;
  hint: string;
  styleDirective: string;
}> = [
  {
    id: "slow_suspense",
    label: "Slow & Suspenseful",
    hint: "0.85x · Heavy tension",
    styleDirective:
      "slow, deliberate, unhurried pace with weighty storytelling suspense",
  },
  {
    id: "measured_doc",
    label: "Measured Documentary",
    hint: "0.95x · Grounded 150 WPM",
    styleDirective:
      "steady, measured documentary pace around 150 words per minute with clear articulation",
  },
  {
    id: "natural",
    label: "Natural Conversational",
    hint: "1.0x · Balanced flow",
    styleDirective:
      "natural, effortless conversational storytelling pace with organic cadence",
  },
  {
    id: "urgent_tense",
    label: "Urgent & Tense",
    hint: "1.1x · Rising stakes",
    styleDirective:
      "slightly brisk, urgent, high-stakes pacing that builds palpable pressure",
  },
  {
    id: "fast_thriller",
    label: "Fast-Paced Thriller",
    hint: "1.2x · Shorts & hooks",
    styleDirective:
      "tight, brisk, high-retention thriller pacing ideal for fast-moving hooks and Shorts",
  },
];

export const NARRATION_PUNCTUATION_OPTIONS: Array<{
  id: NarrationPunctuationMode;
  label: string;
  description: string;
  styleDirective: string;
  paragraphPauseSeconds: number;
}> = [
  {
    id: "natural_breath",
    label: "Natural Breathing Pauses",
    description: "Organic beats at commas, periods, and paragraph breaks.",
    styleDirective:
      "respect every comma and period with natural storyteller breathing pauses and clean phrasing",
    paragraphPauseSeconds: 0.45,
  },
  {
    id: "dramatic_pauses",
    label: "Dramatic Suspense Pauses",
    description: "Extended dramatic beats before reveals and punch lines.",
    styleDirective:
      "linger noticeably on periods, ellipses, and short punch sentences to let suspense sink in before continuing",
    paragraphPauseSeconds: 0.85,
  },
  {
    id: "tight_shorts",
    label: "Tight / Punchy Cuts",
    description: "Minimal dead air for high-retention Shorts & Reels.",
    styleDirective:
      "keep punctuation transitions crisp and tight with minimal dead air between sentences for high retention",
    paragraphPauseSeconds: 0.2,
  },
  {
    id: "strict_literal",
    label: "Strict Literal Punctuation",
    description: "Exact, even reading strictly matching written marks.",
    styleDirective:
      "follow punctuation marks strictly and evenly with clean, disciplined pauses and zero ad-libs",
    paragraphPauseSeconds: 0.3,
  },
];

export const NARRATION_EMOTION_OPTIONS: Array<{
  id: NarrationEmotion;
  label: string;
  styleDirective: string;
}> = [
  {
    id: "documentary_grit",
    label: "Documentary Grit",
    styleDirective:
      "grounded, gripping first-person survival narrator with quiet underdog grit and authentic realism",
  },
  {
    id: "whispered_suspense",
    label: "Whispered Suspense",
    styleDirective:
      "hushed, low, close-mic whispered suspense as if speaking quietly in the dark",
  },
  {
    id: "bold_authoritative",
    label: "Bold & Authoritative",
    styleDirective:
      "bold, commanding, confident narrator voice with strong vocal weight and crisp emphasis",
  },
  {
    id: "loud_urgent",
    label: "Loud & Urgent",
    styleDirective:
      "loud, forceful, high-energy urgent delivery conveying immediate danger and high adrenaline",
  },
  {
    id: "warm_intimate",
    label: "Warm & Intimate",
    styleDirective:
      "warm, intimate, human storytelling voice with genuine empathy and close emotional presence",
  },
  {
    id: "dark_haunting",
    label: "Dark & Haunting",
    styleDirective:
      "dark, brooding, eerie, haunting tone with chilling restraint and solemn atmosphere",
  },
  {
    id: "calm_reflective",
    label: "Calm & Reflective",
    styleDirective:
      "calm, composed, deeply reflective survivor looking back with quiet awe and clarity",
  },
  {
    id: "tense_breathless",
    label: "Tense & Breathless",
    styleDirective:
      "tense, tightly wound, slightly breathless delivery as if living through a crisis in real time",
  },
  {
    id: "emotional_raw",
    label: "Emotional & Raw",
    styleDirective:
      "raw, vulnerable, emotionally charged voice carrying real personal stakes and human weight",
  },
];

export interface InlineCueTool {
  id: string;
  label: string;
  category: "delivery" | "vocal" | "pause";
  mode: "wrap" | "insert";
  openTag: string;
  closeTag?: string;
  placeholder?: string;
  description: string;
}

export const INLINE_CUE_TOOLS: InlineCueTool[] = [
  {
    id: "whisper",
    label: "Whisper",
    category: "delivery",
    mode: "wrap",
    openTag: "[whisper]",
    closeTag: "[/whisper]",
    placeholder: "whispered line",
    description: "Drop into a hushed, close-mic whisper for selected text",
  },
  {
    id: "loud",
    label: "Loud",
    category: "delivery",
    mode: "wrap",
    openTag: "[loud]",
    closeTag: "[/loud]",
    placeholder: "loud urgent line",
    description: "Deliver selected text with loud, forceful vocal intensity",
  },
  {
    id: "bold",
    label: "Bold",
    category: "delivery",
    mode: "wrap",
    openTag: "[bold]",
    closeTag: "[/bold]",
    placeholder: "bold punch line",
    description: "Speak with bold, authoritative emphasis and vocal weight",
  },
  {
    id: "slow",
    label: "Slow",
    category: "delivery",
    mode: "wrap",
    openTag: "[slow]",
    closeTag: "[/slow]",
    placeholder: "slow dramatic line",
    description: "Slow down deliberately to highlight a crucial reveal",
  },
  {
    id: "urgent",
    label: "Urgent",
    category: "delivery",
    mode: "wrap",
    openTag: "[urgent]",
    closeTag: "[/urgent]",
    placeholder: "urgent crisis beat",
    description: "Deliver rapidly with tense, breathless crisis urgency",
  },
  {
    id: "breath",
    label: "<breath>",
    category: "vocal",
    mode: "insert",
    openTag: " <breath> ",
    description: "Insert a natural audible breath intake (Gemini 3.8 Flash TTS)",
  },
  {
    id: "gasp",
    label: "<gasp>",
    category: "vocal",
    mode: "insert",
    openTag: " <gasp> ",
    description: "Insert a sharp startled gasp (Gemini 3.8 Flash TTS)",
  },
  {
    id: "sigh",
    label: "<sigh>",
    category: "vocal",
    mode: "insert",
    openTag: " <sigh> ",
    description: "Insert an exhausted or relieved sigh (Gemini 3.8 Flash TTS)",
  },
  {
    id: "laugh",
    label: "<laugh>",
    category: "vocal",
    mode: "insert",
    openTag: " <laugh> ",
    description: "Insert a dry or natural laugh (Gemini 3.8 Flash TTS)",
  },
  {
    id: "pause_half",
    label: "Pause 0.5s",
    category: "pause",
    mode: "insert",
    openTag: " [pause 0.5s] ",
    description: "Insert an exact 0.5-second silent beat",
  },
  {
    id: "pause_1",
    label: "Pause 1s",
    category: "pause",
    mode: "insert",
    openTag: " [pause 1s] ",
    description: "Insert an exact 1-second dramatic silence",
  },
  {
    id: "pause_2",
    label: "Pause 2s",
    category: "pause",
    mode: "insert",
    openTag: " [pause 2s] ",
    description: "Insert an exact 2-second scene-transition silence",
  },
];

/**
 * Complete Google Gemini 3.8 TTS Studio Voice Gallery (all 70 official prebuilt voices).
 * Includes the 40 expanded Gemini 3.8 voices (Riko, Enzo, Sami, Zali, Brio, Arlo, Fola, etc.)
 * plus the 30 core astronomical voices (Charon, Fenrir, Orus, Kore, Puck, Zephyr, etc.).
 */
export const GOOGLE_TTS_VOICES: VoiceProfile[] = [
  // Featured Storytellers & Gemini 3.8 Expanded Voices
  {
    name: "Riko",
    gender: "Male",
    tone: "Deep · Confident Storyteller",
    bestFor: "Long-form narration, survival thrillers & cinematic scripts",
    sampleLine:
      "By day twenty-one, every streetlight in the district had gone dark, and the silence outside felt heavier than the cold.",
  },
  {
    name: "Charon",
    gender: "Male",
    tone: "Informative · Steady Baritone",
    bestFor: "Survival documentaries & calm crisis narration",
    sampleLine:
      "By day twenty-one, the street lights had been dead for four nights, and nobody in town was sleeping anymore.",
  },
  {
    name: "Enzo",
    gender: "Male",
    tone: "Crisp · Expressive Storyteller",
    bestFor: "Dynamic narrative scripts, pacing shifts & audiobooks",
    sampleLine:
      "Nobody heard the grid fail until the refrigerators stopped humming all at once down the entire block.",
  },
  {
    name: "Sami",
    gender: "Female",
    tone: "Low · Poised Storyteller",
    bestFor: "Commanding long-form storytelling & suspenseful narration",
    sampleLine:
      "Three hours after the warning broadcast cut off, the highway south was already a frozen river of headlights.",
  },
  {
    name: "Zali",
    gender: "Female",
    tone: "Warm · Empathetic Storyteller",
    bestFor: "Human-centered survival arcs & emotional chapters",
    sampleLine:
      "What kept us going wasn't luck. It was realizing how quickly strangers become family when everything breaks.",
  },
  {
    name: "Fenrir",
    gender: "Male",
    tone: "Excitable · Gritty & Dramatic",
    bestFor: "High-stakes thrillers, cold opens & intense turns",
    sampleLine:
      "That was the exact second the transformer blew, and every single alarm on the block died at once.",
  },
  {
    name: "Orus",
    gender: "Male",
    tone: "Firm · Authoritative",
    bestFor: "Bold documentary narration & systemic collapse",
    sampleLine:
      "Here is what nobody expects when the grid fails. It is not the dark that breaks you first. It is the silence.",
  },
  {
    name: "Algenib",
    gender: "Male",
    tone: "Gravelly · Weathered",
    bestFor: "Raw first-person survivor logs & dark suspense",
    sampleLine:
      "We had three gallons of clean water left, two flashlights, and a winter front dropping fast over the ridge.",
  },
  {
    name: "Kore",
    gender: "Female",
    tone: "Firm · Clear & Poised",
    bestFor: "Crisp investigative storytelling & modern narration",
    sampleLine:
      "Three weeks earlier, I was just standing in a grocery aisle complaining that the card reader was slow.",
  },
  {
    name: "Enceladus",
    gender: "Male",
    tone: "Breathy · Intimate",
    bestFor: "Whispered tension, late-night horror & quiet scenes",
    sampleLine:
      "Listen closely. Out past the treeline, the generators stopped humming an hour ago, and something is moving.",
  },
  {
    name: "Puck",
    gender: "Male",
    tone: "Upbeat · Expressive",
    bestFor: "Dynamic storytelling, fast pacing & engaging Shorts",
    sampleLine:
      "Every movie tells you to raid the supermarket first. Turns out, that is the fastest way to get trapped.",
  },
  {
    name: "Zephyr",
    gender: "Female",
    tone: "Bright · Energetic",
    bestFor: "Punchy Shorts, Reels & rapid curiosity hooks",
    sampleLine:
      "What happens seventy-two hours after every cargo ship on Earth stops moving? Almost nobody sees the real threat coming.",
  },
  {
    name: "Arlo",
    gender: "Male",
    tone: "Balanced · Conversational",
    bestFor: "Relatable first-person storytelling & clean delivery",
    sampleLine:
      "Most people think survival starts in the wilderness. In reality, it starts inside your own kitchen on day two.",
  },
  {
    name: "Bodi",
    gender: "Male",
    tone: "Low · Soft & Intimate",
    bestFor: "Close-mic late-night narration & reflective pacing",
    sampleLine:
      "If you sit still long enough after the power dies, you can hear the whole city cooling down steel by steel.",
  },
  {
    name: "Brio",
    gender: "Male",
    tone: "Smooth · Engaging Podcast",
    bestFor: "Long-form episodes, documentaries & audio essays",
    sampleLine:
      "Modern cities only carry about seventy-two hours of fresh food on the shelves before supply lines run dry.",
  },
  {
    name: "Cleo",
    gender: "Female",
    tone: "Warm · Inviting",
    bestFor: "Engaging introductions, host narration & character warmth",
    sampleLine:
      "Welcome back to the shelter. Tonight we are tracking what happens when winter hits without a single working furnace.",
  },
  {
    name: "Cruz",
    gender: "Male",
    tone: "Authoritative · Formal",
    bestFor: "Serious briefings, systemic breakdowns & bold narration",
    sampleLine:
      "Without diesel deliveries every forty-eight hours, emergency hospital generators fail in a predictable sequence.",
  },
  {
    name: "Daro",
    gender: "Male",
    tone: "Clear · Neutral & Steady",
    bestFor: "Consistent long-form episodes & factual storytelling",
    sampleLine:
      "Day four marked the moment clean tap water stopped flowing to any apartment above the third floor.",
  },
  {
    name: "Elio",
    gender: "Male",
    tone: "Crisp · Polished",
    bestFor: "Structured documentaries & clean studio narration",
    sampleLine:
      "Every bridge out of the valley was built for commuters, never for half a million people leaving at once.",
  },
  {
    name: "Enya",
    gender: "Female",
    tone: "Approachable · Clear",
    bestFor: "Practical survival science & grounded explanations",
    sampleLine:
      "Boiling water kills bacteria, but if chemical runoff enters the reservoir, boiling alone will not make it safe.",
  },
  {
    name: "Finn",
    gender: "Male",
    tone: "Friendly · Steady",
    bestFor: "Everyday protagonist voice & grounded human stories",
    sampleLine:
      "I checked the battery gauge one last time, folded the paper map, and stepped out into the snow.",
  },
  {
    name: "Fola",
    gender: "Female",
    tone: "Clear · Warm & Natural",
    bestFor: "Natural cadence across dialogue and everyday storytelling",
    sampleLine:
      "No one remembers the exact minute the signal vanished—only the eerie quiet that followed across the street.",
  },
  {
    name: "Gero",
    gender: "Male",
    tone: "Neutral · Balanced",
    bestFor: "Clean utility narration & objective timeline recaps",
    sampleLine:
      "Hour twelve: cell towers switch to backup batteries. Hour eighteen: regional data centers shut down.",
  },
  {
    name: "Hali",
    gender: "Female",
    tone: "Calm · Reassuring",
    bestFor: "Gentle aftermath scenes & comforting emotional moments",
    sampleLine:
      "Even after the worst night of the storm, the sun came up sharp and bright over the rooftops.",
  },
  {
    name: "Jett",
    gender: "Male",
    tone: "Sharp · Engaging",
    bestFor: "Fast-paced survival tactics & rapid Shorts hooks",
    sampleLine:
      "Stop trying to start a fire with damp twigs. Here is the one trick that actually works in freezing rain.",
  },
  {
    name: "Jori",
    gender: "Female",
    tone: "Balanced · Conversational",
    bestFor: "Documentary hosting & steady narrative pacing",
    sampleLine:
      "When we traced how fast shelves empty during a blackout, the real bottleneck turned out to be payment terminals.",
  },
  {
    name: "Kira",
    gender: "Female",
    tone: "Composed · Confident",
    bestFor: "Instructional survival breakdowns & sharp analysis",
    sampleLine:
      "Physics does not negotiate. Once indoor temperatures drop below freezing, uninsulated pipes split within hours.",
  },
  {
    name: "Knox",
    gender: "Male",
    tone: "Low · Warm & Grounded",
    bestFor: "Deep, trustworthy first-person survival narration",
    sampleLine:
      "I spent ten years maintaining substations, so the second I saw that blue flash on the horizon, I knew we had minutes.",
  },
  {
    name: "Koda",
    gender: "Male",
    tone: "Direct · Engaging Baritone",
    bestFor: "Bold commercial voiceovers, trailers & episode hooks",
    sampleLine:
      "One solar storm. Seventy-two hours. And everything we took for granted vanished overnight.",
  },
  {
    name: "Lora",
    gender: "Female",
    tone: "Clear · Friendly",
    bestFor: "Accessible storytelling & relatable character perspective",
    sampleLine:
      "We packed two backpacks, taped the windows against the draft, and waited for daylight.",
  },
  {
    name: "Ludo",
    gender: "Male",
    tone: "Low · Clear & Confident",
    bestFor: "Authoritative explainers & gripping scientific turns",
    sampleLine:
      "Most bunkers fail for one overlooked reason: carbon dioxide builds up far faster than people expect.",
  },
  {
    name: "Lumi",
    gender: "Female",
    tone: "Low · Warm & Soft",
    bestFor: "Intimate narration, quiet suspense & reflective endings",
    sampleLine:
      "By candlelight, the living room felt like a ship adrift in a dark sea.",
  },
  {
    name: "Mako",
    gender: "Male",
    tone: "Low · Vivid & Energetic",
    bestFor: "High-energy action beats, adventure & thriller momentum",
    sampleLine:
      "The ice cracked beneath the truck tires just as we hit the far side of the embankment.",
  },
  {
    name: "Milo",
    gender: "Male",
    tone: "Low · Soft & Close-Mic",
    bestFor: "Whispered suspense, intimate diaries & tense calm",
    sampleLine:
      "Keep your voice down. If they hear the radio static from the stairwell, we lose our only shelter.",
  },
  {
    name: "Neno",
    gender: "Male",
    tone: "Deep Low · Smooth & Mellow",
    bestFor: "Deep cinematic bass voiceovers & late-night documentaries",
    sampleLine:
      "Deep beneath the city, the subway tunnels stay fifty-five degrees even when the surface freezes solid.",
  },
  {
    name: "Nika",
    gender: "Female",
    tone: "Warm · Approachable",
    bestFor: "Polished narration, hooks & expressive storytelling",
    sampleLine:
      "What looks like an ordinary basement pantry becomes a lifeline the moment the supply trucks stop.",
  },
  {
    name: "Nyla",
    gender: "Female",
    tone: "Crisp · Efficient",
    bestFor: "Fast technical narration & high-clarity updates",
    sampleLine:
      "Within six hours of grid collapse, emergency dispatch frequencies reach full saturation.",
  },
  {
    name: "Olin",
    gender: "Male",
    tone: "Low · Crisp & Precise",
    bestFor: "Clean engineering details & disciplined pacing",
    sampleLine:
      "A single car alternator and a salvaged deep-cycle battery gave us two hours of light every evening.",
  },
  {
    name: "Rami",
    gender: "Male",
    tone: "Low · Warm & Inviting",
    bestFor: "Fireside storytelling, podcasts & long-form arcs",
    sampleLine:
      "Pull up a chair and let me tell you how four neighbors kept an entire apartment block alive that winter.",
  },
  {
    name: "Rina",
    gender: "Female",
    tone: "Gentle · Relaxed",
    bestFor: "Calm narration, thoughtful pacing & quiet reflections",
    sampleLine:
      "Little by little, the neighborhood stopped checking their phones and started checking on each other.",
  },
  {
    name: "Sola",
    gender: "Female",
    tone: "Light · Soft & Relaxed",
    bestFor: "Delicate storytelling & youthful perspective",
    sampleLine:
      "I had never seen the Milky Way from my bedroom window until the night the city lights went out.",
  },
  {
    name: "Tari",
    gender: "Female",
    tone: "Clear · Confident",
    bestFor: "Decisive narrative beats & strong documentary delivery",
    sampleLine:
      "We drew a line on the map—twenty miles east—and agreed nobody would turn back once we crossed the river.",
  },
  {
    name: "Tavi",
    gender: "Female",
    tone: "Soft · Intimate",
    bestFor: "Close-mic suspense, emotional beats & whispered tension",
    sampleLine:
      "Hold still. Don't shine the flashlight toward the window until those footsteps pass the gate.",
  },
  {
    name: "Tova",
    gender: "Female",
    tone: "Medium-Low · Soothing & Resonant",
    bestFor: "Rich, dignified narration & sweeping aftermath scenes",
    sampleLine:
      "Civilization is thinner than we believe, yet human ingenuity runs far deeper than any storm.",
  },
  {
    name: "Varo",
    gender: "Male",
    tone: "Low · Relaxed & Casual",
    bestFor: "Natural conversational survivor voice & easy flow",
    sampleLine:
      "Honestly, nobody panicked on day one. Everyone treated it like an unexpected snow day.",
  },
  {
    name: "Veda",
    gender: "Female",
    tone: "Natural · Steady Podcast",
    bestFor: "Long-form narration, discussions & documentary flow",
    sampleLine:
      "When you trace the chain reaction of a nationwide blackout, water—not food—becomes the first real crisis.",
  },
  {
    name: "Zeno",
    gender: "Male",
    tone: "Poised · Confident",
    bestFor: "Crisp hooks, trailers & decisive narration",
    sampleLine:
      "Every assumption about modern comfort breaks down the instant the refrigeration chain fails.",
  },
  {
    name: "Zuri",
    gender: "Female",
    tone: "Polished · Executive",
    bestFor: "Formal briefings, investigative narration & authority",
    sampleLine:
      "Official protocols assume external aid arrives in seventy-two hours. When the crisis is global, nobody is coming.",
  },

  // Remaining Core Astronomical Voices
  {
    name: "Aoede",
    gender: "Female",
    tone: "Breezy · Warm Storyteller",
    bestFor: "Human-centered survival arcs & emotional reflections",
    sampleLine:
      "Looking back, it was never the concrete walls that saved us. It was the neighbor who remembered how to purify rainwater.",
  },
  {
    name: "Alnilam",
    gender: "Male",
    tone: "Firm · Grounded",
    bestFor: "Engineering explainers woven into survival stories",
    sampleLine:
      "Without pressure from the pumping stations, a modern city loses tap water in less than forty-eight hours.",
  },
  {
    name: "Schedar",
    gender: "Male",
    tone: "Even · Composed",
    bestFor: "Long-form 20-minute episodes & steady narration",
    sampleLine:
      "Every morning at dawn we checked the barometer, rationed the batteries, and waited for a broadcast that never came.",
  },
  {
    name: "Sulafat",
    gender: "Female",
    tone: "Warm · Empathetic",
    bestFor: "Emotional character drama, romance & personal loss",
    sampleLine:
      "I watched her wrap the last wool blanket around her shoulders, pretending the cold did not bother her at all.",
  },
  {
    name: "Gacrux",
    gender: "Female",
    tone: "Mature · Resonant",
    bestFor: "Commanding cinematic narration & historical weight",
    sampleLine:
      "History remembers the storms, never the quiet Tuesday afternoon when the warning signs were ignored.",
  },
  {
    name: "Rasalgethi",
    gender: "Male",
    tone: "Informative · Analytical",
    bestFor: "Science-backed twists & infrastructure breakdown",
    sampleLine:
      "Most backup generators at hospitals only hold enough diesel for three days before the supply trucks must arrive.",
  },
  {
    name: "Sadaltager",
    gender: "Male",
    tone: "Knowledgeable · Clear",
    bestFor: "Educational survival storytelling & documentary voice",
    sampleLine:
      "Once the refrigeration chain breaks, insulin loses potency far faster than most people realize.",
  },
  {
    name: "Iapetus",
    gender: "Male",
    tone: "Clear · Articulate",
    bestFor: "Clean audiobook-style narration & dialogue clarity",
    sampleLine:
      "We locked the cellar door from the inside and listened to footsteps crunching across the frozen gravel.",
  },
  {
    name: "Despina",
    gender: "Female",
    tone: "Smooth · Velvety",
    bestFor: "Atmospheric suspense & late-night stories",
    sampleLine:
      "The sky turned a strange pale copper just before noon, and every bird in the valley went completely silent.",
  },
  {
    name: "Vindemiatrix",
    gender: "Female",
    tone: "Gentle · Reflective",
    bestFor: "Aftermath rebuilding & quiet emotional endings",
    sampleLine:
      "Six months later, wild grass was already splitting the highway asphalt where traffic used to roar all night.",
  },
  {
    name: "Leda",
    gender: "Female",
    tone: "Youthful · Earnest",
    bestFor: "First-person personal diaries & relatable survival",
    sampleLine:
      "I used to complain when my phone dropped to ten percent. Now I would trade everything I own for one working radio.",
  },
  {
    name: "Callirrhoe",
    gender: "Female",
    tone: "Easy-going · Conversational",
    bestFor: "Natural conversational hooks & curious stories",
    sampleLine:
      "Here is the thing nobody tells you about living off the grid. Everything takes three times longer than you think.",
  },
  {
    name: "Autonoe",
    gender: "Female",
    tone: "Bright · Crisp",
    bestFor: "Clear narration & rapid scene transitions",
    sampleLine:
      "First the cell towers jammed, then the debit cards failed, and by sunset the gas stations had bags over the pumps.",
  },
  {
    name: "Erinome",
    gender: "Female",
    tone: "Clear · Poised",
    bestFor: "Journalistic clarity & factual tension",
    sampleLine:
      "Scientists had estimated a storm like this once every century. Nobody predicted it would strike twice in one week.",
  },
  {
    name: "Umbriel",
    gender: "Male",
    tone: "Easy-going · Calm",
    bestFor: "Relaxed conversational openings & steady pacing",
    sampleLine:
      "It started on an ordinary October morning with a cup of black coffee and a sky that looked a little too still.",
  },
  {
    name: "Achird",
    gender: "Male",
    tone: "Friendly · Natural",
    bestFor: "Relatable everyday protagonist storytelling",
    sampleLine:
      "I am not a survival expert. I was just a guy with half a tank of gas trying to get back across the river.",
  },
  {
    name: "Zubenelgenubi",
    gender: "Male",
    tone: "Casual · Grounded",
    bestFor: "Unvarnished street-level first-person narration",
    sampleLine:
      "Nobody panicked during the first six hours. Everyone just assumed the utility crew would have it fixed by dinner.",
  },
  {
    name: "Algieba",
    gender: "Male",
    tone: "Smooth · Polished",
    bestFor: "Cinematic YouTube documentaries & studio voiceovers",
    sampleLine:
      "Modern civilization runs on an invisible clockwork of deliveries, and it only takes forty-eight hours to jam the gears.",
  },
  {
    name: "Sadachbia",
    gender: "Male",
    tone: "Lively · Dynamic",
    bestFor: "Fast-moving adventure & energetic reveals",
    sampleLine:
      "When the bridge closed behind us, we had twenty minutes of daylight left and zero map of the back roads.",
  },
  {
    name: "Laomedeia",
    gender: "Female",
    tone: "Upbeat · Engaging",
    bestFor: "Curious thought experiments & engaging intros",
    sampleLine:
      "You probably walked past five survival tools in your own kitchen this morning without noticing a single one.",
  },
  {
    name: "Pulcherrima",
    gender: "Female",
    tone: "Forward · Confident",
    bestFor: "Bold statements, decisive moments & dramatic arcs",
    sampleLine:
      "We had one choice left before the frost hit. Stay inside a dying city, or walk forty miles into the mountains.",
  },
  {
    name: "Achernar",
    gender: "Female",
    tone: "Soft · Soothing",
    bestFor: "Quiet reflective beats & tender character moments",
    sampleLine:
      "By the firelight, nobody talked about the world we lost. We only talked about making it to morning.",
  },
];

export const ALLOWED_VOICE_NAMES = new Set(
  GOOGLE_TTS_VOICES.map((v) => v.name)
);

export function buildNarrationStylePrompt(params: {
  emotion: NarrationEmotion;
  pace: NarrationPace;
  punctuationMode: NarrationPunctuationMode;
  customDirection?: string;
  spanStyleOverride?: string;
}): string {
  const emotionDirective =
    NARRATION_EMOTION_OPTIONS.find((e) => e.id === params.emotion)
      ?.styleDirective ?? "grounded, engaging narrator";
  const paceDirective =
    NARRATION_PACE_OPTIONS.find((p) => p.id === params.pace)?.styleDirective ??
    "steady, clear storytelling pace";
  const punctuationDirective =
    NARRATION_PUNCTUATION_OPTIONS.find((p) => p.id === params.punctuationMode)
      ?.styleDirective ?? "natural breathing pauses";

  const parts = [
    params.spanStyleOverride
      ? `Primary delivery for this line: ${params.spanStyleOverride}`
      : `Tone and emotion: ${emotionDirective}`,
    `Pacing: ${paceDirective}`,
    `Punctuation and pauses: ${punctuationDirective}`,
  ];

  if (params.customDirection?.trim()) {
    parts.push(`Director notes: ${params.customDirection.trim()}`);
  }

  return parts.join(". ") + ".";
}

export function createInitialNarrationState(): NarrationWorkspaceState {
  return {
    scriptText: "",
    sourceTitle: "",
    sourceEpisodeCode: "",
    voiceName: "Charon",
    model: "gemini-3.8-flash-tts",
    pace: "measured_doc",
    punctuationMode: "natural_breath",
    emotion: "documentary_grit",
    customDirection: "",
    lastAudioBlob: null,
    lastAudioDuration: 0,
    lastAudioVoice: "",
    updatedAt: Date.now(),
  };
}
