import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      throw new Error("REPLICATE_API_TOKEN is not configured");
    }

    const { action, predictionId, audioUrl } = await req.json();

    // Poll for prediction status
    if (action === "poll" && predictionId) {
      const pollResp = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        }
      );

      if (!pollResp.ok) {
        const errText = await pollResp.text();
        console.error("Replicate poll error:", pollResp.status, errText);
        throw new Error("Failed to check separation status");
      }

      const prediction = await pollResp.json();
      return new Response(JSON.stringify(prediction), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Start a new prediction
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: "No audio URL provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify({
        version: "25a173108cff36ef9f80f854c162d01df9e6528be175794b81571db564ef4571",
        input: {
          audio: audioUrl,
          stem: "vocals",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Replicate create error:", response.status, errText);

      if (response.status === 401 || response.status === 403) {
        throw new Error("Invalid Replicate API token. Please check your key.");
      }
      throw new Error("Failed to start stem separation");
    }

    const prediction = await response.json();
    return new Response(JSON.stringify(prediction), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("separate-stems error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
