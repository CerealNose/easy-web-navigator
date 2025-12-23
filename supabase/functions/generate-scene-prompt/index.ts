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
    const { lyricLine, sceneIndex, totalScenes, styleHint, previousPrompt } = await req.json();

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

    const systemPrompt = `You are a cinematic visual director creating image prompts for music video scenes.

For each lyric line, generate a UNIQUE, DETAILED cinematic image prompt that:
1. Captures the emotion and narrative of that specific lyric
2. Uses concrete visual elements (setting, lighting, camera angle, color palette)
3. Differs significantly from previous scenes for visual variety
4. Maintains cinematic quality and mood

Scene ${sceneIndex + 1} of ${totalScenes}.
${previousPrompt ? `IMPORTANT: Make this scene DIFFERENT from the previous one which was: "${previousPrompt.slice(0, 100)}..."` : ''}
${styleHint ? `Overall style direction: ${styleHint}` : ''}

Return ONLY the image prompt text, nothing else. The prompt should be 1-2 sentences, specific and visual.`;

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
