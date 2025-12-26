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

      case 'get_video':
        // Fetch a video file from ComfyUI output
        const videoParams = payload as { filename: string; subfolder?: string; type?: string };
        const videoQueryParams = new URLSearchParams({ 
          filename: videoParams.filename, 
          subfolder: videoParams.subfolder || '', 
          type: videoParams.type || 'output' 
        });
        response = await fetch(`${comfyUrl}/view?${videoQueryParams}`, {
          method: 'GET',
        });
        
        if (response.ok) {
          // Return video as base64
          const videoArrayBuffer = await response.arrayBuffer();
          const videoBase64 = base64Encode(videoArrayBuffer);
          const videoContentType = response.headers.get('content-type') || 'video/mp4';
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              videoData: `data:${videoContentType};base64,${videoBase64}` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;

      case 'upload_video':
        // Upload a video file to ComfyUI input folder
        const { videoData: uploadVideoData, filename: videoUploadFilename } = payload as { videoData: string; filename: string };
        
        // Convert base64 to blob
        const videoBase64Data = uploadVideoData.replace(/^data:video\/\w+;base64,/, '');
        const videoBinaryData = Uint8Array.from(atob(videoBase64Data), c => c.charCodeAt(0));
        
        // Create form data - upload to input folder
        const videoFormData = new FormData();
        const videoBlob = new Blob([videoBinaryData], { type: 'video/mp4' });
        videoFormData.append('image', videoBlob, videoUploadFilename); // ComfyUI uses 'image' field for all uploads
        videoFormData.append('overwrite', 'true');
        videoFormData.append('subfolder', 'videos');
        
        response = await fetch(`${comfyUrl}/upload/image`, {
          method: 'POST',
          body: videoFormData,
        });
        break;

      case 'get_models':
        response = await fetch(`${comfyUrl}/object_info/CheckpointLoaderSimple`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        break;

      case 'get_object_info':
        const nodeClass = payload?.node_class || '';
        response = await fetch(`${comfyUrl}/object_info/${nodeClass}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        break;

      case 'upload_image':
        // Upload a base64 image to ComfyUI
        const { imageData, filename: uploadFilename } = payload as { imageData: string; filename: string };
        
        // Convert base64 to blob
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        // Create form data
        const formData = new FormData();
        const blob = new Blob([binaryData], { type: 'image/png' });
        formData.append('image', blob, uploadFilename);
        formData.append('overwrite', 'true');
        
        response = await fetch(`${comfyUrl}/upload/image`, {
          method: 'POST',
          body: formData,
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
