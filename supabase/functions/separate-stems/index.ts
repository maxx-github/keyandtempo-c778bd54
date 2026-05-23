import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
};

// ryan5453/demucs — htdemucs model. Accepts output_format wav/mp3/flac
// When `stem` is set to "vocals", output is { vocals, other } (the requested
// stem + everything else merged). This gives us a clean instrumental.
const DEMUCS_VERSION =
  "25a173108cff36ef9f80f854c162d01df9e6528be175794b81571db564ef4571";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Small fetch wrapper with retries for transient network/5xx errors so a
// momentary blip doesn't kill a long-running separation job.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, init);
      if (resp.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return resp;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network error");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      return json({ error: "REPLICATE_API_TOKEN is not configured" }, 500);
    }

    let payload: { action?: string; predictionId?: string; audioUrl?: string };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { action, predictionId, audioUrl } = payload;

    // Poll for prediction status
    if (action === "poll") {
      if (!predictionId) {
        return json({ error: "predictionId is required for poll" }, 400);
      }

      const pollResp = await fetchWithRetry(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } },
      );

      if (!pollResp.ok) {
        const errText = await pollResp.text();
        console.error("Replicate poll error:", pollResp.status, errText);
        return json(
          { error: "Failed to check separation status", details: errText },
          502,
        );
      }

      const prediction = await pollResp.json();
      return json(prediction);
    }

    // Start a new prediction
    if (!audioUrl || typeof audioUrl !== "string") {
      return json({ error: "audioUrl is required" }, 400);
    }
    try {
      new URL(audioUrl);
    } catch {
      return json({ error: "audioUrl must be a valid URL" }, 400);
    }

    const response = await fetchWithRetry(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "respond-async",
        },
        body: JSON.stringify({
          version: DEMUCS_VERSION,
          input: {
            audio: audioUrl,
            stem: "vocals",
            model_name: "htdemucs",
            output_format: "wav",
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Replicate create error:", response.status, errText);

      if (response.status === 401 || response.status === 403) {
        return json(
          { error: "Invalid Replicate API token. Please check your key." },
          502,
        );
      }
      if (response.status === 402) {
        return json(
          { error: "Replicate billing issue. Please check your account." },
          502,
        );
      }
      return json(
        { error: "Failed to start stem separation", details: errText },
        502,
      );
    }

    const prediction = await response.json();
    return json(prediction);
  } catch (e) {
    console.error("separate-stems error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
