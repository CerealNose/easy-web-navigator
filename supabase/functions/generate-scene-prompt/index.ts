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
    const { lyricLine, sceneIndex, totalScenes, styleHint, previousPrompt, storyline, narrativeBeat } = await req.json();

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
      // Create a consistent, detailed character description
      characterDescription = storyline.protagonist || "";
      
      storylineContext = `
STORYLINE CONTEXT:
- Story: ${storyline.summary || ""}
- Setting: ${storyline.setting || ""}
- Emotional Arc: ${storyline.emotionalArc || ""}
- Visual Motifs to include: ${(storyline.visualMotifs || []).join(", ")}
${narrativeBeat ? `- This scene's narrative beat: ${narrativeBeat}` : ""}

CRITICAL - CHARACTER CONSISTENCY:
The protagonist MUST be described EXACTLY the same way in EVERY scene: "${characterDescription}"
Do NOT change any physical features. Use this EXACT description when the protagonist appears.
`;
    }

    const systemPrompt = `You are a cinematic visual director creating image prompts for a cohesive music video with a clear narrative.
${storylineContext}
For this lyric line, generate a UNIQUE, DETAILED cinematic image prompt that:
1. ALWAYS includes the EXACT protagonist description if they appear: "${characterDescription}"
2. Advances the storyline at this point in the narrative
3. Incorporates the visual motifs and setting from the storyline
4. Uses concrete visual elements (lighting, camera angle, color palette)
5. Differs from previous scenes while maintaining story coherence
6. NEVER change the protagonist's appearance - same face, hair, skin, body type

Scene ${sceneIndex + 1} of ${totalScenes}.
${previousPrompt ? `IMPORTANT: Make this scene DIFFERENT visually from the previous one which was: "${previousPrompt.slice(0, 100)}..."` : ""}
${styleHint ? `Overall style direction: ${styleHint}` : ""}

Return ONLY the image prompt text, nothing else. The prompt should be 1-2 sentences, specific and visual. ALWAYS include the exact character description when the protagonist appears.`;

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
          { role: "user", content: `Create a unique cinematic image prompt for this lyric: "${lyricLine}"` }
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
