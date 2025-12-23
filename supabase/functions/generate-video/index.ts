import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { imageUrl, prompt, duration = 5, seed } = body;

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

    // Create prediction with seedance-1-lite
    // Model accepts: image, prompt, duration (5 or 10), seed
    const input: Record<string, unknown> = {
      image: imageUrl,
      prompt: prompt || "cinematic motion, smooth camera movement",
      duration: duration <= 5 ? 5 : 10, // seedance-1-lite supports 5 or 10 second videos
    };

    // Add seed if provided for consistency
    if (seed !== undefined && seed !== null) {
      input.seed = seed;
    }

    console.log("Replicate input:", JSON.stringify(input, null, 2));

    const prediction = await replicate.predictions.create({
      model: "bytedance/seedance-1-lite",
      input,
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
