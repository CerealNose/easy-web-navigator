import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Analyzing prompt for motion suggestion:', prompt);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a cinematography expert. Analyze the given prompt and suggest the best camera motion for a video.

Available camera motions:
- PanLeft: Camera pans left. Best for: wide landscapes, cityscapes, revealing scenes, horizontal movement
- PanRight: Camera pans right. Best for: wide landscapes, cityscapes, revealing scenes, horizontal movement  
- ZoomIn: Camera zooms in. Best for: dramatic focus, portraits, emotional moments, close-ups, faces, eyes
- ZoomOut: Camera zooms out. Best for: establishing shots, reveals, showing scale, person in vast environment
- TiltUp: Camera tilts up. Best for: tall subjects, buildings, waterfalls, looking up at something, character reveals
- TiltDown: Camera tilts down. Best for: looking down, descending motion, ground reveals
- RollingClockwise: Camera rotates clockwise. Best for: dreamy/surreal content, space scenes, abstract visuals, disorientation
- RollingAnticlockwise: Camera rotates counter-clockwise. Best for: dreamy/surreal content, space scenes, abstract visuals

Rules:
1. Choose the single best motion that enhances the prompt
2. Consider the subject matter and emotional tone
3. ZoomIn is safest for most prompts - use it when unsure
4. Use pans for wide/horizontal scenes
5. Use tilts for tall/vertical subjects
6. Use rolling only for surreal/abstract content`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'suggest_motion',
              description: 'Suggest the best camera motion for the video prompt',
              parameters: {
                type: 'object',
                properties: {
                  motion: {
                    type: 'string',
                    enum: ['PanLeft', 'PanRight', 'ZoomIn', 'ZoomOut', 'TiltUp', 'TiltDown', 'RollingClockwise', 'RollingAnticlockwise'],
                    description: 'The recommended camera motion'
                  },
                  reason: {
                    type: 'string',
                    description: 'Brief reason for this choice (max 20 words)'
                  },
                  strength: {
                    type: 'number',
                    description: 'Recommended strength between 0.4 and 1.0'
                  }
                },
                required: ['motion', 'reason', 'strength'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'suggest_motion' } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    console.log('AI response:', JSON.stringify(data));

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback to ZoomIn if no tool call
      return new Response(
        JSON.stringify({ 
          motion: 'ZoomIn', 
          reason: 'Default choice for versatility',
          strength: 0.7
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const suggestion = JSON.parse(toolCall.function.arguments);
    console.log('Motion suggestion:', suggestion);

    return new Response(
      JSON.stringify(suggestion),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error suggesting motion:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
