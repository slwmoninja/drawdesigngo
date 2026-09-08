// Minimal CORS-enabling passthrough to OpenAI's Chat Completions API.
//
// Why this exists: api.openai.com sends no Access-Control-Allow-Origin
// header, so a static site (FloorPlanner, GitHub Pages, no backend) can't
// call it directly from the browser -- every request gets blocked by CORS
// before it even reaches OpenAI. Anthropic's API has a header
// (anthropic-dangerous-direct-browser-access) specifically to allow direct
// browser calls; OpenAI has no equivalent, so this Worker exists purely to
// add that missing CORS header and forward the request unchanged.
//
// This does NOT hold or see your OpenAI key persistently -- it reads the
// key you send per-request (from FloorPlanner's own localStorage, entered
// by you in the app) and forwards it straight to OpenAI. Cloudflare Workers
// don't log request bodies by default. If you want a hard guarantee no
// other site can use this proxy with your key, set ALLOWED_ORIGIN below to
// your FloorPlanner GitHub Pages URL instead of "*".

const ALLOWED_ORIGIN = 'https://slwmoninja.github.io'; // FloorPlanner's actual GitHub Pages origin

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Only POST is supported.', { status: 405, headers: CORS_HEADERS });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return new Response('Missing Authorization header.', { status: 401, headers: CORS_HEADERS });
    }

    // Stream the request/response bodies through rather than buffering them
    // as strings -- photo uploads can be tens of MB (base64-encoded images),
    // and materializing that in memory as a JS string crashed the Worker
    // (Cloudflare error 1101) under real multi-photo payloads.
    //
    // The upstream fetch is wrapped in try/catch (and a hard timeout) on
    // purpose -- if it throws (network hiccup, upstream hang, OpenAI taking
    // longer than Cloudflare's own subrequest budget) with nothing here to
    // catch it, Cloudflare returns its own generic crash page, which never
    // gets CORS_HEADERS attached (those are only added by Response objects
    // this code builds). Without that header the browser can't even read the
    // response and just reports a bare "Failed to fetch" -- exactly the
    // unhelpful failure mode this is closing off, so real errors (including
    // upstream timeouts) actually reach the app's status text instead.
    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), 60000);
    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': request.headers.get('content-type') || 'application/json',
          'authorization': authHeader,
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
        ? 'Request to OpenAI timed out after 60s.'
        : 'Proxy error reaching OpenAI: ' + (err && err.message ? err.message : String(err));
      return new Response(JSON.stringify({ error: { message } }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};
