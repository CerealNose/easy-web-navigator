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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageUrl, imageBase64, motionHint, lyricContext } = await req.json();

    const imageSource = imageBase64 || imageUrl;
    if (!imageSource) {
      return new Response(
        JSON.stringify({ error: "Image URL or base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Analyzing image for video motion prompt...");

    const systemPrompt = `You are a video director creating motion prompts for AI video generation. 
Your job is to look at an image and describe how it should be animated as a short video clip.

Focus on describing MOTION and MOVEMENT:
- Camera movement (slow pan, zoom in, dolly, tracking shot, etc.)
- Subject movement (walking, turning, breathing, wind effects, etc.)
- Environmental motion (clouds moving, leaves falling, rain, etc.)
- Subtle animations (hair moving, fabric flowing, light flickering, etc.)

${motionHint ? `MOTION STYLE PREFERENCE: ${motionHint}` : ""}
${lyricContext ? `EMOTIONAL CONTEXT from lyrics: "${lyricContext}"` : ""}

Rules:
1. Describe what's IN the image first briefly, then focus on HOW it should move
2. Keep the prompt 2-3 sentences
3. Be specific about camera direction and speed
4. Match the motion to the mood of the image
5. Do NOT describe things that aren't in the image`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and create a video motion prompt describing how to animate it. Focus on camera movement and subtle motion that brings the scene to life."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageSource
                }
              }
            ]
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const videoPrompt = data.choices?.[0]?.message?.content?.trim() || "";

    console.log("Video motion prompt generated:", videoPrompt.slice(0, 100) + "...");

    return new Response(
      JSON.stringify({ videoPrompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-video-prompt:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
