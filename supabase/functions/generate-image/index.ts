/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper with exponential backoff for rate limits
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 10000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a rate limit error (429)
      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        // Extract retry_after if available
        const retryAfterMatch = errorMessage.match(/retry_after["\s:]+(\d+)/);
        const retryAfter = retryAfterMatch ? parseInt(retryAfterMatch[1]) * 1000 : initialDelay;
        const delay = Math.max(retryAfter, initialDelay * Math.pow(2, attempt));
        
        if (attempt < maxRetries) {
          console.log(`Rate limited. Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
          await sleep(delay);
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

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

    // FLUX Schnell with seed for consistency - with retry logic
    const output = await retryWithBackoff(async () => {
      return await replicate.run(
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
    });

    console.log("Generation complete:", output);

    // output is an array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    return new Response(
      JSON.stringify({ imageUrl, seed: useSeed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-image:", error);

    const anyErr = error as any;
    const upstreamStatus: number | undefined =
      typeof anyErr?.response?.status === "number" ? anyErr.response.status : undefined;

    const msg = error instanceof Error ? error.message : String(error);

    // If Replicate returns a non-2xx (e.g., 402 insufficient credit, 429 rate limit),
    // propagate that status so the client can handle it properly.
    const status =
      upstreamStatus ??
      (msg.includes("402") || msg.includes("Payment Required")
        ? 402
        : msg.includes("429") || msg.includes("Too Many Requests")
          ? 429
          : 500);

    const userMessage =
      status === 402
        ? "Replicate billing issue: insufficient credit. Please top up your Replicate account and try again."
        : status === 429
          ? "Replicate rate limit hit. Please wait a bit and try again."
          : msg;

    return new Response(JSON.stringify({ error: userMessage }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
