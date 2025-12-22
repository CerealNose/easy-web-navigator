/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScheduleItem {
  start: number;
  end: number;
  text: string;
  prompt: string;
  section?: string;
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

    const { schedule, batchSize = 3 } = await req.json();

    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
      return new Response(
        JSON.stringify({ error: "Schedule array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating ${schedule.length} images in batches of ${batchSize}`);

    const results: { index: number; imageUrl: string; prompt: string; start: number; end: number }[] = [];
    const errors: { index: number; error: string }[] = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < schedule.length; i += batchSize) {
      const batch = schedule.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item: ScheduleItem, batchIndex: number) => {
        const index = i + batchIndex;
        try {
          console.log(`Generating image ${index + 1}/${schedule.length}: ${item.prompt.substring(0, 50)}...`);
          
          const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
              input: {
                prompt: item.prompt,
                go_fast: true,
                num_outputs: 1,
                aspect_ratio: "16:9",
                output_format: "webp",
                output_quality: 80,
                num_inference_steps: 4
              }
            }
          );

          const imageUrl = Array.isArray(output) ? output[0] : output;
          
          return {
            success: true,
            data: {
              index,
              imageUrl: imageUrl as string,
              prompt: item.prompt,
              start: item.start,
              end: item.end
            }
          };
        } catch (error) {
          console.error(`Error generating image ${index}:`, error);
          return {
            success: false,
            data: {
              index,
              error: error instanceof Error ? error.message : "Unknown error"
            }
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.success) {
          results.push(result.data as typeof results[0]);
        } else {
          errors.push(result.data as typeof errors[0]);
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < schedule.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Completed: ${results.length} successes, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        images: results.sort((a, b) => a.index - b.index),
        errors,
        total: schedule.length,
        successful: results.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-batch-images:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
