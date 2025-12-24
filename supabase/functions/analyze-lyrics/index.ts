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

    console.log("Analyzing lyrics, length:", lyrics.length);

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
            content: `You are a lyrical analysis AI specializing in music video visualization and storytelling. Your task is to analyze lyrics deeply and create THREE DISTINCT storyline interpretations:

1. **LITERAL**: The surface-level story - what the lyrics literally describe
2. **METAPHORICAL**: The deeper symbolic meaning - what the lyrics are really about underneath
3. **ABSTRACT/EMOTIONAL**: A purely artistic, mood-driven interpretation that captures the emotional essence

For each storyline, consider:
- Song lyrics often have hidden meanings, metaphors, and subtext
- A song about "rain" might really be about depression
- A song about "fire" might represent passion or destruction
- Love songs might be about addiction, loss, or self-discovery

Each storyline should be complete and distinct, offering a genuinely different creative direction for a music video.

**CRITICAL PROTAGONIST RULE**: 
The protagonist must ALWAYS be described as a SILHOUETTE figure. Choose one of these three options:
1. **Male Silhouette**: A dark silhouette of a male figure - describe posture, build (slim/athletic/broad), height impression, any distinctive silhouette features (hair outline, clothing shape)
2. **Female Silhouette**: A dark silhouette of a female figure - describe posture, build, hair silhouette (long flowing/short/tied up), clothing outline, stance
3. **Abstract Silhouette**: A non-human or abstract silhouette shape - could be a morphing shadow, a fragmented figure, geometric human-like form, or ethereal smoke-like presence

The protagonist description should focus on the SHAPE and OUTLINE visible in silhouette form against various backdrops. Never describe facial features, skin tone, or eye color - only what would be visible as a dark shadow/silhouette.`
          },
          {
            role: "user",
            content: `Analyze these lyrics deeply. Look for both the obvious meaning AND the underlying themes, metaphors, and emotions. Create 3 distinct storyline interpretations. Remember: ALL protagonists MUST be described as silhouettes (male, female, or abstract).\n\n${lyrics}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_lyrics_result",
              description: "Return 3 distinct storyline interpretations of the lyrics",
              parameters: {
                type: "object",
                properties: {
                  themes: {
                    type: "array",
                    description: "Detected emotional themes across all interpretations",
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
                    description: "Primary emotions detected across all interpretations"
                  },
                  storylines: {
                    type: "array",
                    description: "THREE distinct storyline interpretations",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["literal", "metaphorical", "abstract"],
                          description: "The type of interpretation"
                        },
                        title: {
                          type: "string",
                          description: "A catchy title for this interpretation (e.g., 'The Breakup', 'Battle with Addiction', 'Descent into Chaos')"
                        },
                        summary: {
                          type: "string",
                          description: "2-3 sentence summary of this video concept"
                        },
                        protagonist: {
                          type: "string",
                          description: "SILHOUETTE DESCRIPTION ONLY. Must be one of: 1) Male silhouette - describe build, posture, hair outline, clothing shape. 2) Female silhouette - describe build, stance, hair silhouette, clothing outline. 3) Abstract silhouette - morphing shadow, fragmented figure, geometric form, or ethereal presence. Focus ONLY on shape/outline visible as a dark shadow. NO facial features, skin tone, or colors."
                        },
                        setting: {
                          type: "string",
                          description: "The world/environment where this story takes place"
                        },
                        emotionalArc: {
                          type: "string",
                          description: "The emotional journey (e.g., 'loneliness → connection → hope')"
                        },
                        visualMotifs: {
                          type: "array",
                          items: { type: "string" },
                          description: "Recurring visual symbols/elements for this interpretation"
                        },
                        colorPalette: {
                          type: "string",
                          description: "The dominant color palette (e.g., 'cool blues and grays', 'warm amber and gold')"
                        },
                        cinematicStyle: {
                          type: "string",
                          description: "The visual style (e.g., 'noir with harsh shadows', 'dreamy soft focus', 'gritty handheld')"
                        }
                      },
                      required: ["type", "title", "summary", "protagonist", "setting", "emotionalArc", "visualMotifs", "colorPalette", "cinematicStyle"]
                    }
                  },
                  moodPrompt: {
                    type: "string",
                    description: "Overall cinematic style keywords that apply to all interpretations"
                  },
                  sectionPrompts: {
                    type: "array",
                    description: "Visual prompts for each section (using the literal interpretation as default)",
                    items: {
                      type: "object",
                      properties: {
                        section: { 
                          type: "string", 
                          description: "Section name exactly as it appears in lyrics" 
                        },
                        narrativeBeat: {
                          type: "string",
                          description: "What happens in the story at this point"
                        },
                        prompt: { 
                          type: "string", 
                          description: "Detailed cinematic image prompt" 
                        }
                      },
                      required: ["section", "narrativeBeat", "prompt"]
                    }
                  }
                },
                required: ["themes", "emotions", "storylines", "moodPrompt", "sectionPrompts"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_lyrics_result" } },
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("AI Gateway error:", response.status, error);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response received");
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(data, null, 2));
      throw new Error("No tool call in response");
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log("Generated", analysis.storylines?.length || 0, "storylines");

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
