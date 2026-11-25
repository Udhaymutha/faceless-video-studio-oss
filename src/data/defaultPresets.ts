import type { InstructionPreset } from "../types/studio";

export const MAX_BATCH_SCENES = 20;
export const MAX_TOTAL_PROMPTS = 400;

export const MASTER_IMAGE_AGENT_PROMPT = `You are an image-generation agent operating under a strict character-continuity production brief.

Common Character Reference Directory (Strict Rule):
- Always take the character's visual identity directly from the common Master Stickman Character Reference Directory configured in the Character Reference section.
- Every time an image is generated, direct the character reference lookup straight to the Master Stickman Character Reference Directory. Never check individual prompts for an attached reference image, never ask the user to attach or upload a reference image, and never pause to verify per-prompt attachments.
- Whenever a character reference is needed for any scene in any batch, pull it directly from the common Master Stickman Character Reference Directory automatically.

Workflow:
1. Receive a batch of up to 20 image prompts (from a sequence of up to 400 images total).
2. Generate one image for EVERY prompt in that batch, automatically pulling the character visual reference directly from the common Master Stickman Character Reference Directory so the character looks identical in every image.
3. When the batch is complete, cache the completed batch locally and record the last scene number used so the next batch continues seamlessly.
4. For every later batch, continue generating directly using the same common Master Stickman Character Reference Directory and continue numbering from where the previous batch ended.
5. Repeat for every later batch until the entire sequence is finished.

Rules:
1. Strictly use the common Master Stickman Character Reference Directory as the visual reference for every single image across all batches. Do not skip it for any prompt, including later batches, and do not check per-prompt whether a reference image is attached.
2. Keep the character's identity fully consistent with the Master Stickman Character Reference Directory: head and facial features, stickman body proportions, line weight, hair, skin/fill tone, outfit details, accessories, and the overall art style.
3. If an image prompt describes the character differently from the Master Stickman Character Reference Directory, follow the Master Stickman Character Reference Directory for character identity and design. Follow the image prompt for everything else: scene, pose, action, expression, camera angle, lighting, background, and mood.
4. Exception: if an image prompt explicitly asks for a different outfit, pose, or expression, apply that change while keeping the Master Stickman character recognizably the same.
5. Generate one separate image per prompt, in the order given. Do not combine prompts, skip any, or add extra images.
6. Label each image with its scene number (the same number used as its file name, see Rule 7).
7. Rename each generated image with its scene number, using only the number as the file name. Scene numbers form ONE running sequence across all batches:
   - In the first batch, the image from the first prompt is named "1", the second is named "2", the third is named "3", and so on.
   - In every later batch, continue from the last number already used. For example, if the previous batch ended at 20, the first prompt of the next batch is named "21", the second is named "22", and so on. If that batch ends at 40, the next one starts at "41".
   - If a batch has fewer than 20 prompts, still continue the same sequence for the next batch.
   - Use the running sequence for the names even if the prompts pasted carry their own numbering.
8. Do not redesign or reinterpret the character from text alone. Do not ask clarifying questions or request reference attachments before generating.
9. If a batch cannot finish all images in one pass, generate as many as possible in order, record which scene number completed last, and continue from the next scene number while keeping the same running numbering.`;

export const DEFAULT_PRESETS: InstructionPreset[] = [
  {
    id: "preset-master-character-agent",
    name: "Master Stickman Continuity Brief",
    summary:
      "Primary Director's Brief: pulls character identity directly from the common Master Stickman Character Reference Directory for every image across 20-image batches (1.png, 2.png…).",
    instructions: MASTER_IMAGE_AGENT_PROMPT,
    negativeRules:
      "Never alter the Master Stickman character's core design or art style, never ask for reference attachments, no watermarks, no text labels overlaid on the image.",
    defaultAspectRatio: "16:9",
    isBuiltIn: true,
    updatedAt: 1732187200000,
  },
  {
    id: "preset-cinematic-film",
    name: "Cinematic 35mm Character Sequence",
    summary:
      "Character-consistent widescreen 35mm cinema still frames pulling identity directly from the common Master Stickman Character Reference Directory.",
    instructions: `Pull the character's identity, face, proportions, line style, and core styling strictly from the common Master Stickman Character Reference Directory for every scene. Never check individual prompts for an attached reference image.
Style: 35mm cinema still frame captured on an anamorphic prime lens with shallow depth of field and subtle organic film grain.
Composition: Adapt camera angle, lighting, pose, action, and environment to match each individual prompt while preserving visual continuity across the sequence.`,
    negativeRules:
      "No neon cyberpunk glow, no glossy 3D plastic look, no text overlays, no subtitles, no split-screen collages, no watermarks.",
    defaultAspectRatio: "16:9",
    isBuiltIn: true,
    updatedAt: 1732187200000,
  },
  {
    id: "preset-editorial-doc",
    name: "Editorial Natural-Light Sequence",
    summary:
      "Candid natural-light visual sequence pulling character identity directly from the common Master Stickman Character Reference Directory.",
    instructions: `Pull the exact character identity and styling directly from the common Master Stickman Character Reference Directory in every frame. Never check individual prompts for an attached reference image.
Style: Documentary editorial visual aesthetic in natural available light with crisp textures, authentic expressions, and grounded environments matching each prompt.`,
    negativeRules:
      "No studio flash look, no airbrushed plastic textures, no overly saturated HDR colors, no text or watermarks.",
    defaultAspectRatio: "4:3",
    isBuiltIn: true,
    updatedAt: 1732187200000,
  },
];

export const SAMPLE_TWENTY_SCENE_SCRIPT = `1. Wide establishing shot of the character standing at the entrance of a sunlit cobblestone alley at dawn, looking forward with quiet curiosity, warm golden morning light casting long shadows.
2. Medium close-up of the character holding an old folded parchment map in both hands, eyebrows slightly furrowed while studying the route in soft daylight.
3. Over-the-shoulder shot of the character stepping into a bustling open-air market filled with woven baskets and warm hanging lanterns, lively mid-morning atmosphere.
4. Dynamic side-angle shot of the character walking briskly past terracotta storefronts, glancing back over one shoulder with an alert expression.
5. Tight close-up of the character smiling warmly while inspecting a small brass compass held in one palm, shallow depth of field.
6. Wide shot of the character crossing an arched stone footbridge over a calm reflective river under pale afternoon clouds.
7. Low-angle shot of the character pausing at the foot of a tall ivy-covered clocktower, tilting their head upward toward the spire.
8. Medium shot of the character seated at a quiet outdoor wooden cafe table, sketching notes into a small leather-bound journal with focused posture.
9. Three-quarter view of the character looking surprised as a sudden gust of wind sweeps loose autumn leaves across the plaza.
10. Action shot of the character reaching out to catch a drifting sheet of paper mid-air along a windy stone walkway.
11. Medium-wide view inside a cozy sunlit library, the character reaching toward a high wooden bookshelf with determined eyes.
12. Close-up of the character reading an open illustrated book by a tall arched window, warm late-afternoon light illuminating their face.
13. Wide twilight shot of the character walking up a winding hillside trail overlooking glowing harbor lights in the distance.
14. Medium shot of the character lighting a small brass lantern on a rocky cliffside bench as deep blue dusk settles in.
15. Atmospheric wide shot of the character standing near a wooden lighthouse railing under a clear starry sky, holding the glowing lantern.
16. Close-up reaction shot of the character looking toward the horizon with quiet relief and a gentle smile, soft lantern rim light.
17. Medium shot of the character sitting beside a crackling beach campfire at night, warming their hands peacefully.
18. Wide dawn shot of the character boarding a small wooden sailboat tied to a quiet pier as soft pink morning mist lifts off the water.
19. Dynamic three-quarter shot of the character gripping the wooden tiller on deck as the sail catches the fresh sea breeze, confident expression.
20. Sweeping wide finale shot of the character standing at the bow looking out toward a sunlit green island rising on the horizon.`;
