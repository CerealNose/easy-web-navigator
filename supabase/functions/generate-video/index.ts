import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) {
      console.error("REPLICATE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_KEY is not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const body = await req.json();

    // If it's a status check request (polling for prediction result)
    if (body.taskId) {
      console.log("Checking status for prediction:", body.taskId);
      
      try {
        const prediction = await replicate.predictions.get(body.taskId);
        console.log("Prediction status:", prediction.status);

        if (prediction.status === "succeeded") {
          // seedance-1-lite returns the video URL directly in output
          const videoUrl = prediction.output;
          console.log("Video ready:", videoUrl);
          return new Response(
            JSON.stringify({ status: "succeeded", videoUrl }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else if (prediction.status === "failed" || prediction.status === "canceled") {
          console.error("Prediction failed:", prediction.error);
          return new Response(
            JSON.stringify({ status: "failed", error: prediction.error || "Video generation failed" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          // Still processing (starting, processing, etc.)
          return new Response(
            JSON.stringify({ status: prediction.status }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (pollError) {
        console.error("Error polling prediction:", pollError);
        return new Response(
          JSON.stringify({ status: "processing", message: "Still processing, will retry" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // New video generation request
    const { 
      imageUrl, 
      prompt, 
      duration = 5, 
      seed, 
      resolution = "480p",
      aspectRatio = "16:9",
      fps = 24,
      lastFrameImage 
    } = body;

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Starting video generation with seedance-1-lite");
    console.log("Prompt:", prompt);
    console.log("Image URL (first 100 chars):", imageUrl.substring(0, 100));
    console.log("Duration:", duration);
    console.log("Resolution:", resolution);
    console.log("Aspect Ratio:", aspectRatio);
    console.log("FPS:", fps);
    console.log("Last frame image provided:", !!lastFrameImage);

    // Create prediction with seedance-1-lite
    // Model accepts: image, prompt, duration (2-12), resolution, aspect_ratio, fps, last_frame_image, seed
    const input: Record<string, unknown> = {
      image: imageUrl,
      prompt: prompt || "cinematic motion, smooth camera movement",
      duration: Math.round(Math.min(Math.max(duration, 2), 12)), // clamp between 2-12 seconds and ensure integer
      resolution: resolution, // "480p", "720p", or "1080p"
      aspect_ratio: aspectRatio, // "16:9", "9:16", or "1:1"
      fps: 24, // seedance-1-lite only supports 24 fps
    };

    // Note: last_frame_image is for specifying END frame, not for scene continuity
    // For scene continuity, we use the extracted frame as the starting "image" parameter
    // Only add last_frame_image if user wants to specify a specific ending frame
    if (lastFrameImage) {
      input.last_frame_image = lastFrameImage;
    }

    // Add seed if provided for consistency
    if (seed !== undefined && seed !== null) {
      input.seed = seed;
    }

    console.log("Replicate input:", JSON.stringify(input, null, 2));

    // Create prediction with retry logic for rate limits
    const prediction = await retryWithBackoff(async () => {
      return await replicate.predictions.create({
        model: "bytedance/seedance-1-lite",
        input,
      });
    });

    console.log("Prediction created:", prediction.id, "Status:", prediction.status);

    return new Response(
      JSON.stringify({ 
        taskId: prediction.id, 
        status: "processing",
        message: "Video generation started"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in generate-video function:", error);

    const anyErr = error as any;
    const upstreamStatus: number | undefined =
      typeof anyErr?.response?.status === "number" ? anyErr.response.status : undefined;

    const msg = error instanceof Error ? error.message : String(error);

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
