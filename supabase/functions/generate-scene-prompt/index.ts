/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lyricLine, sceneIndex, totalScenes, styleHint, previousPrompt, storyline, narrativeBeat, useSilhouetteMode, motionHint } = await req.json();

    if (!lyricLine || typeof lyricLine !== "string") {
      return new Response(
        JSON.stringify({ error: "lyricLine is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build storyline context if available
    let storylineContext = "";
    let characterDescription = "";
    if (storyline) {
      // In silhouette mode, avoid any facial-detail character descriptors (they cause the model to render faces).
      // Keep only a generic, consistency-safe silhouette description.
      characterDescription = useSilhouetteMode
        ? "A slender adult woman shown only as a silhouette (no facial features, no eyes, no skin details), consistent height and build"
        : (storyline.protagonist || "");

      storylineContext = `
STORYLINE CONTEXT:
- Story: ${storyline.summary || ""}
- Setting: ${storyline.setting || ""}
- Emotional Arc: ${storyline.emotionalArc || ""}
- Visual Motifs to include: ${(storyline.visualMotifs || []).join(", ")}
${narrativeBeat ? `- This scene's narrative beat: ${narrativeBeat}` : ""}

${useSilhouetteMode ? "CRITICAL - SILHOUETTE MODE:\nNever describe faces, eyes, skin, or identifiable facial features. Characters must remain silhouettes." : `CRITICAL - CHARACTER CONSISTENCY:\nThe protagonist MUST be described EXACTLY the same way in EVERY scene: "${characterDescription}"\nDo NOT change any physical features. Use this EXACT description when the protagonist appears.`}
`;
    }

    // Build character style instructions based on mode
    let characterStyleInstructions = "";
    if (useSilhouetteMode) {
      characterStyleInstructions = `
CRITICAL STYLE RULE: All human figures must be shown as SILHOUETTES - backlit, shadowed, or in dramatic contrast.
- NEVER describe or request faces, eyes, skin tone, facial expressions, or facial features
- Use body language, posture, and environment to convey emotion
- Use dramatic backlighting, rim lighting, or shadows to create silhouette effects
- Characters should be dark outlines against dramatic lighting
- If a protagonist is mentioned, describe only: silhouette, height/build, clothing outline`; 
    } else {
      // Explicitly tell AI to NOT use silhouette styling
      characterStyleInstructions = `
IMPORTANT STYLE RULE: Do NOT use silhouette styling. Show characters clearly and fully visible.
- Describe characters with clear visibility, good lighting on their faces and bodies
- Include facial expressions, emotions, and details when describing people
- Avoid backlit, shadowed, or silhouetted figures
- Use front lighting, three-point lighting, or ambient lighting that reveals character details
${characterDescription ? `\nCRITICAL - CHARACTER CONSISTENCY:\nThe protagonist MUST be described EXACTLY the same way in EVERY scene: "${characterDescription}"\nDo NOT change any physical features. Use this EXACT description when the protagonist appears.` : ""}`;
    }

    const systemPrompt = `You are a cinematic visual director creating image prompts for a cohesive music video with a clear narrative.
${storylineContext}
${characterStyleInstructions}

For this lyric line, generate a UNIQUE, DETAILED cinematic VIDEO prompt that:
1. ${useSilhouetteMode ? "Shows characters as SILHOUETTES with dramatic backlighting" : characterDescription ? `ALWAYS includes the EXACT protagonist description: "${characterDescription}"` : "Creates visually compelling characters"}
2. Advances the storyline at this point in the narrative
3. Incorporates the visual motifs and setting from the storyline
4. Uses concrete visual elements (lighting, camera angle, color palette)
5. Differs from previous scenes while maintaining story coherence
6. DESCRIBES MOTION AND MOVEMENT - what is happening, how the camera moves, how subjects move

${motionHint ? `MOTION STYLE: ${motionHint}` : "Include natural motion appropriate to the scene mood."}

Scene ${sceneIndex + 1} of ${totalScenes}.
${previousPrompt ? `IMPORTANT: Make this scene DIFFERENT visually from the previous one which was: "${previousPrompt.slice(0, 100)}..."` : ""}
${styleHint ? `Overall style direction: ${styleHint}` : ""}

Return ONLY the video prompt text, nothing else. The prompt should be 2-3 sentences describing the VISUAL SCENE and the MOTION/MOVEMENT.${useSilhouetteMode ? " Characters MUST be silhouettes." : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a unique cinematic video prompt for this lyric: "${lyricLine}". Include motion description.` }
        ],
        temperature: 0.9, // Higher for more variety
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("AI Gateway error:", error);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const prompt = data.choices?.[0]?.message?.content?.trim();
    
    if (!prompt) {
      throw new Error("No prompt generated");
    }

    console.log(`Scene ${sceneIndex + 1} prompt generated:`, prompt.slice(0, 100) + "...");

    return new Response(
      JSON.stringify({ prompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-scene-prompt:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
