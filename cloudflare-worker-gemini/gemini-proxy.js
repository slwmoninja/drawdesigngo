// Minimal CORS-enabling passthrough to Google's Generative Language API
// (Gemini), used by DrawDesignGo's "Photoreal 3D" button.
//
// Why this exists: generativelanguage.googleapis.com sends no
// Access-Control-Allow-Origin header, so a static site (DrawDesignGo,
// GitHub Pages, no backend) can't call it directly from the browser --
// every request gets blocked by CORS before it even reaches Google. This
// Worker exists purely to add that missing CORS header and forward the
// request unchanged.
//
// Unlike the OpenAI proxy (which forwards to one fixed endpoint), Gemini
// puts the model name in the URL path itself (.../models/MODEL:generateContent),
// and that name will change over time as newer models ship. So this proxy
// forwards whatever path+query the client sends, unmodified, onto
// generativelanguage.googleapis.com -- the client controls which model/
// endpoint it's calling, this Worker just bridges CORS.
//
// This does NOT hold or see your Gemini key persistently -- it reads the
// key you send per-request (from DrawDesignGo's own localStorage, entered
// by you in the app, sent as the x-goog-api-key header) and forwards it
// straight to Google. Cloudflare Workers don't log request bodies by
// default. If you want a hard guarantee no other site can use this proxy
// with your key, set ALLOWED_ORIGIN below to your DrawDesignGo GitHub
// Pages URL instead of "*".

const ALLOWED_ORIGIN = 'https://slwmoninja.github.io'; // DrawDesignGo's actual GitHub Pages origin

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-goog-api-key',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Only POST is supported.', { status: 405, headers: CORS_HEADERS });
    }

    const apiKey = request.headers.get('x-goog-api-key');
    if (!apiKey) {
      return new Response('Missing x-goog-api-key header.', { status: 401, headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);
    const upstreamUrl = 'https://generativelanguage.googleapis.com' + incoming.pathname + incoming.search;

    // Same reasoning as the OpenAI proxy: stream the body through rather
    // than buffering as a string (the reference image sent along with the
    // prompt is a base64-encoded PNG, easily several MB), wrap the upstream
    // fetch in try/catch + a hard timeout so a network hiccup or slow
    // generation doesn't produce a bare CORS-less crash page, and image
    // generation can genuinely take tens of seconds.
    const controller = new AbortController();
    const TIMEOUT_MS = 120000;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'content-type': request.headers.get('content-type') || 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: request.body,
        duplex: 'half',
        signal: controller.signal,
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...CORS_HEADERS, 'content-type': upstream.headers.get('content-type') || 'application/json' },
      });
    } catch (err) {
      const message = err && err.name === 'AbortError'
        ? `Request to Gemini timed out after ${TIMEOUT_MS/1000}s.`
        : 'Proxy error reaching Gemini: ' + (err && err.message ? err.message : String(err));
      return new Response(JSON.stringify({ error: { message } }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};
