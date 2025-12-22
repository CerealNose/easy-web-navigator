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
    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured");
    }

    const body = await req.json();
    const { imageUrl, prompt, duration = 6, resolution = "720P", taskId, predictionId } = body;

    // Support both taskId (new Minimax) and predictionId (legacy Replicate) parameter names
    const videoTaskId = taskId || predictionId;

    // Check if this is a status check request
    if (videoTaskId) {
      console.log("Checking task status:", videoTaskId);
      
      // Query task status
      const queryResponse = await fetch(
        `https://api.minimax.io/v1/query/video_generation?task_id=${videoTaskId}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${MINIMAX_API_KEY}`,
          },
        }
      );
      
      const queryData = await queryResponse.json();
      console.log("Task status response:", JSON.stringify(queryData));
      
      const status = queryData.status;
      
      if (status === "Success" && queryData.file_id) {
        // Get the download URL for the video
        const fileResponse = await fetch(
          `https://api.minimax.io/v1/files/retrieve?file_id=${queryData.file_id}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${MINIMAX_API_KEY}`,
            },
          }
        );
        
        const fileData = await fileResponse.json();
        console.log("File retrieve response:", JSON.stringify(fileData));
        
        if (fileData.file?.download_url) {
          return new Response(
            JSON.stringify({ 
              videoUrl: fileData.file.download_url, 
              status: "succeeded" 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          throw new Error("Failed to get download URL");
        }
      } else if (status === "Fail") {
        return new Response(
          JSON.stringify({ 
            error: queryData.base_resp?.status_msg || "Video generation failed", 
            status: "failed" 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Still processing (Preparing, Queueing, Processing)
        return new Response(
          JSON.stringify({ status: status.toLowerCase(), taskId: videoTaskId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // New video generation request
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Generating video from image:", imageUrl.substring(0, 50) + "...");
    console.log("Prompt:", prompt);
    console.log("Duration:", duration);
    console.log("Resolution:", resolution);

    // Start async video generation with Minimax
    const generateResponse = await fetch("https://api.minimax.io/v1/video_generation", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "I2V-01-Director",
        first_frame_image: imageUrl,
        prompt: prompt || "cinematic motion, slow camera movement, atmospheric",
        prompt_optimizer: true,
      }),
    });

    const generateData = await generateResponse.json();
    console.log("Generation response:", JSON.stringify(generateData));

    if (generateData.base_resp?.status_code !== 0) {
      throw new Error(generateData.base_resp?.status_msg || "Failed to start video generation");
    }

    console.log("Task started:", generateData.task_id);

    return new Response(
      JSON.stringify({ 
        taskId: generateData.task_id, 
        status: "processing" 
      }),
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
