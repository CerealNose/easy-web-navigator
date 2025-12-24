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
    
    const { cursor, limit = 50 } = body;

    console.log("Fetching predictions from Replicate...");
    console.log("Cursor:", cursor);
    console.log("Limit:", limit);

    // Use the Replicate API to list predictions
    // The replicate SDK doesn't have a direct list method, so we use fetch
    const apiUrl = new URL("https://api.replicate.com/v1/predictions");
    if (cursor) {
      apiUrl.searchParams.set("cursor", cursor);
    }

    const response = await fetch(apiUrl.toString(), {
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Replicate API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Replicate API error: ${response.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: response.status }
      );
    }

    const data = await response.json();
    
    console.log(`Fetched ${data.results?.length || 0} predictions`);
    console.log("Next cursor:", data.next);

    // Return predictions with pagination info
    return new Response(
      JSON.stringify({
        predictions: data.results || [],
        next: data.next || null,
        previous: data.previous || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in retrieve-predictions function:", error);
    const msg = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
