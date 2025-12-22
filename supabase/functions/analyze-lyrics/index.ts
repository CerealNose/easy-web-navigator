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
    const { lyrics } = await req.json();

    if (!lyrics || typeof lyrics !== "string") {
      return new Response(
        JSON.stringify({ error: "Lyrics are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a lyrical analysis AI that detects emotions, moods, and visual themes from song lyrics. 

Your task is to analyze the lyrics and return a JSON object with:
1. "themes" - array of detected themes with their emotional intensity (1-5) and a gradient color pair
2. "emotions" - primary emotions detected
3. "moodPrompt" - a detailed, cinematic image generation prompt that captures the emotional essence of the lyrics

For the moodPrompt, create vivid, atmospheric descriptions suitable for AI image generation. Include:
- Visual setting (city, nature, abstract space)
- Lighting and color palette
- Mood and atmosphere
- Symbolic elements that represent the lyrics
- Style keywords (cinematic, neon, ethereal, etc.)

Return ONLY valid JSON, no markdown or explanation.`
          },
          {
            role: "user",
            content: `Analyze these lyrics and generate a mood-based image prompt:\n\n${lyrics}`
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("AI Gateway error:", error);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response from AI
    let analysis;
    try {
      // Clean the response in case it has markdown code blocks
      const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
      analysis = JSON.parse(cleanedContent);
    } catch {
      console.error("Failed to parse AI response:", content);
      // Fallback with the raw content as the mood prompt
      analysis = {
        themes: [{ name: "emotional", intensity: 3, color: "from-purple-500 to-pink-500" }],
        emotions: ["introspective"],
        moodPrompt: content
      };
    }

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-lyrics:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
