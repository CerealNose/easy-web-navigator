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
            content: `You are a lyrical analysis AI specializing in music video visualization and storytelling. Analyze the lyrics to:
1. Detect emotions, moods, and visual themes
2. Create a cohesive STORYLINE/NARRATIVE ARC that the music video will tell
3. Generate unique visual prompts for each section that follow this storyline

The storyline should describe:
- The protagonist/subject and their journey
- The emotional arc (beginning state → conflict/tension → resolution)
- Key visual motifs that recur throughout
- The setting and world of the video

For EACH SECTION, generate a prompt that:
- Advances the storyline at that point in the narrative
- Maintains visual and thematic coherence with other sections
- Uses different settings, lighting, and compositions for variety`
          },
          {
            role: "user",
            content: `Analyze these lyrics and create a storyline with unique visual prompts for each section:\n\n${lyrics}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_lyrics_result",
              description: "Return the analysis of the lyrics with storyline and per-section visual prompts",
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
                  storyline: {
                    type: "object",
                    description: "The narrative arc and storyline for the music video",
                    properties: {
                      summary: {
                        type: "string",
                        description: "2-3 sentence summary of the video's story/concept"
                      },
                      protagonist: {
                        type: "string",
                        description: "EXTREMELY DETAILED physical description of the main character for visual consistency. MUST include: exact age, gender, ethnicity, skin tone, hair color/style/length, eye color, facial features, body type, height, distinctive marks. Be VERY specific so the character looks identical in every scene. Example: 'A 25-year-old East Asian woman with long straight black hair reaching her waist, warm brown almond-shaped eyes, delicate facial features with high cheekbones, fair porcelain skin, slender build, approximately 5'6 tall, wearing minimal makeup'"
                      },
                      setting: {
                        type: "string",
                        description: "The world/environment where the story takes place"
                      },
                      emotionalArc: {
                        type: "string",
                        description: "The emotional journey from start to finish (e.g., 'loneliness → connection → hope')"
                      },
                      visualMotifs: {
                        type: "array",
                        items: { type: "string" },
                        description: "Recurring visual symbols/elements (e.g., 'rain', 'neon lights', 'empty streets')"
                      }
                    },
                    required: ["summary", "protagonist", "setting", "emotionalArc", "visualMotifs"]
                  },
                  moodPrompt: {
                    type: "string",
                    description: "Overall cinematic style and mood that ties all scenes together"
                  },
                  sectionPrompts: {
                    type: "array",
                    description: "Unique visual prompts for each section that advance the storyline",
                    items: {
                      type: "object",
                      properties: {
                        section: { 
                          type: "string", 
                          description: "Section name exactly as it appears in lyrics" 
                        },
                        narrativeBeat: {
                          type: "string",
                          description: "What happens in the story at this point (1 sentence)"
                        },
                        prompt: { 
                          type: "string", 
                          description: "Detailed cinematic image prompt for this story moment - include setting, lighting, mood, camera angle, symbolic elements" 
                        }
                      },
                      required: ["section", "narrativeBeat", "prompt"]
                    }
                  }
                },
                required: ["themes", "emotions", "storyline", "moodPrompt", "sectionPrompts"]
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
