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
            content: `You are a lyrical analysis AI specializing in music video visualization. Analyze the lyrics to detect emotions, moods, and visual themes. 

For EACH SECTION of the song (marked with [Section Name]), generate a UNIQUE and DISTINCT cinematic image prompt that:
1. Captures the specific emotion and narrative of THAT section
2. Progresses visually through the song's story arc
3. Uses different settings, lighting, and compositions for variety
4. Maintains visual coherence while showing emotional evolution

The sections should feel like a cohesive music video with visual variety, not the same scene repeated.`
          },
          {
            role: "user",
            content: `Analyze these lyrics and create unique visual prompts for each section:\n\n${lyrics}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_lyrics_result",
              description: "Return the analysis of the lyrics with per-section visual prompts",
              parameters: {
                type: "object",
                properties: {
                  themes: {
                    type: "array",
                    description: "Detected emotional themes",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Theme name like 'love', 'melancholy', 'hope'" },
                        intensity: { type: "number", description: "Intensity from 1-5" },
                        color: { type: "string", description: "Tailwind gradient like 'from-pink-500 to-red-500'" }
                      },
                      required: ["name", "intensity", "color"]
                    }
                  },
                  emotions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Primary emotions detected"
                  },
                  moodPrompt: {
                    type: "string",
                    description: "Overall cinematic style and mood that ties all scenes together"
                  },
                  sectionPrompts: {
                    type: "array",
                    description: "Unique visual prompts for each section of the song",
                    items: {
                      type: "object",
                      properties: {
                        section: { 
                          type: "string", 
                          description: "Section name exactly as it appears in lyrics (e.g., 'Intro', 'Verse 1', 'Chorus')" 
                        },
                        prompt: { 
                          type: "string", 
                          description: "Detailed cinematic image prompt unique to this section - include setting, lighting, mood, camera angle, symbolic elements. Should be different from other sections." 
                        }
                      },
                      required: ["section", "prompt"]
                    }
                  }
                },
                required: ["themes", "emotions", "moodPrompt", "sectionPrompts"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_lyrics_result" } },
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("AI Gateway error:", error);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data, null, 2));
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log("Parsed analysis:", JSON.stringify(analysis, null, 2));

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
