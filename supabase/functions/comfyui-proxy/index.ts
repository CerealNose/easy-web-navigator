import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, comfyUrl, payload } = await req.json();
    
    if (!comfyUrl) {
      return new Response(
        JSON.stringify({ error: 'comfyUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`ComfyUI Proxy: ${action} -> ${comfyUrl}`);

    let response: Response;

    switch (action) {
      case 'system_stats':
        response = await fetch(`${comfyUrl}/system_stats`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        break;

      case 'queue_prompt':
        response = await fetch(`${comfyUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'get_queue':
        response = await fetch(`${comfyUrl}/queue`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        break;

      case 'get_history':
        const promptId = payload?.prompt_id;
        response = await fetch(`${comfyUrl}/history/${promptId}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        break;

      case 'get_image':
        const { filename, subfolder, type } = payload;
        const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
        response = await fetch(`${comfyUrl}/view?${params}`, {
          method: 'GET',
        });
        
        if (response.ok) {
          // Return image as base64 using proper encoding (avoids stack overflow)
          const arrayBuffer = await response.arrayBuffer();
          const base64 = base64Encode(arrayBuffer);
          const contentType = response.headers.get('content-type') || 'image/png';
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              imageData: `data:${contentType};base64,${base64}` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;

      case 'get_models':
        response = await fetch(`${comfyUrl}/object_info/CheckpointLoaderSimple`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ComfyUI error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `ComfyUI error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('ComfyUI Proxy error:', error);
    const message = error instanceof Error ? error.message : 'Proxy error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
