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

    const { prompt, seed, width, height, quality } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use provided seed or generate a random one
    const useSeed = seed ?? Math.floor(Math.random() * 2147483647);
    const outputQuality = quality ?? 80;
    
    console.log("Generating image with prompt:", prompt);
    console.log("Using seed:", useSeed);
    console.log("Dimensions:", width, "x", height);
    console.log("Quality:", outputQuality);

    // Determine aspect ratio from dimensions or default to 16:9
    let aspectRatio = "16:9";
    if (width && height) {
      const ratio = width / height;
      if (Math.abs(ratio - 1) < 0.1) aspectRatio = "1:1";
      else if (Math.abs(ratio - 16/9) < 0.1) aspectRatio = "16:9";
      else if (Math.abs(ratio - 9/16) < 0.1) aspectRatio = "9:16";
      else if (Math.abs(ratio - 4/3) < 0.1) aspectRatio = "4:3";
      else if (Math.abs(ratio - 3/4) < 0.1) aspectRatio = "3:4";
    }

    // FLUX Schnell with seed for consistency
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: prompt,
          seed: useSeed,
          go_fast: true,
          num_outputs: 1,
          aspect_ratio: aspectRatio,
          output_format: "webp",
          output_quality: outputQuality,
          num_inference_steps: 4
        }
      }
    );

    console.log("Generation complete:", output);

    // output is an array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    return new Response(
      JSON.stringify({ imageUrl, seed: useSeed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-image:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
