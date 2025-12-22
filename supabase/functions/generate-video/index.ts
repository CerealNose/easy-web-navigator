/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY is not configured");
    }

    const replicate = new Replicate({
      auth: REPLICATE_API_KEY,
    });

    const { imageUrl, prompt, duration = 5, maxArea = "720p", fps = 24 } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Generating video from image:", imageUrl.substring(0, 50) + "...");
    console.log("Prompt:", prompt);
    console.log("Duration:", duration);
    console.log("Max Area:", maxArea);
    console.log("FPS:", fps);

    // Calculate frame count based on duration and FPS
    // WAN 2.1 max frames: 81 (at 16fps = ~5s, at 24fps = ~3.4s)
    const frameNum = Math.min(Math.round(duration * fps), 81);

    // Use Wan 2.1 Image-to-Video model
    const output = await replicate.run(
      "wavespeedai/wan-2.1-i2v-480p",
      {
        input: {
          image: imageUrl,
          prompt: prompt || "cinematic motion, slow camera movement, atmospheric",
          max_area: maxArea,
          fast_mode: "Balanced",
          frame_num: frameNum,
          sample_shift: 8,
          sample_steps: 30,
          sample_guide_scale: 5
        }
      }
    );

    console.log("Video generation complete:", output);

    return new Response(
      JSON.stringify({ videoUrl: output }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-video:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
