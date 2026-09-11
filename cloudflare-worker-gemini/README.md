# DrawDesignGo Gemini proxy

DrawDesignGo is a static site with no backend, and Google's Generative
Language API (Gemini) doesn't support direct browser calls (no CORS
headers) the same way Anthropic's does. This Worker is a thin passthrough
that just adds the missing CORS header and forwards the request to
`generativelanguage.googleapis.com` unchanged -- your Gemini key still only
ever lives in your browser's localStorage and in this Worker's memory for
the duration of a single request; it's never stored anywhere.

Used by the "Photoreal 3D" button (Import Photo's floor-plan analysis still
uses the separate OpenAI/Anthropic proxy+key in `../cloudflare-worker/`).

## Status: deployed 2026-09-11

Live at `https://floorplanner-gemini-proxy.rfwrites2.workers.dev`, locked
to `https://slwmoninja.github.io` (see below) -- the app already has this
URL as its default, so you shouldn't need to touch this unless it needs
redeploying (e.g. after editing `gemini-proxy.js`) or you want your own
separate copy.

## Redeploy / deploy your own (~5 minutes)

1. Install Wrangler if you don't have it: `npm install -g wrangler`
2. From this folder, log in: `wrangler login` (opens a browser to authorize
   against your Cloudflare account -- free tier is plenty for this).
3. Deploy: `wrangler deploy`
4. Wrangler prints a URL like `https://floorplanner-gemini-proxy.<your-subdomain>.workers.dev`.
   Copy it.
5. In DrawDesignGo, open Settings > Photoreal 3D (Gemini), and paste that
   URL into the "Proxy Worker URL" field (replacing the default), plus your
   Gemini API key (from aistudio.google.com/apikey) into the key field.

## Locked to DrawDesignGo's own site

`ALLOWED_ORIGIN` in `gemini-proxy.js` is set to `https://slwmoninja.github.io`
(not `'*'`), so only requests from DrawDesignGo's real deployed origin will
complete in a browser -- others get the CORS header back but it won't match
their origin, so the browser blocks it client-side. This does mean local
testing (e.g. `python -m http.server` on localhost) won't be able to reach
this Worker from Gemini's provider path; temporarily set `ALLOWED_ORIGIN`
back to `'*'` and redeploy if you need to test that locally, then restore it.

## Why a separate Worker from the OpenAI proxy

Gemini puts the model name in the URL path itself
(`.../models/gemini-3.1-flash-image:generateContent`), not a fixed endpoint
like OpenAI's `/v1/chat/completions`, and that model name will keep changing
as newer versions ship. So `gemini-proxy.js` forwards whatever path and
query string the client sends, rather than hardcoding one endpoint -- the
app controls which model it calls, this Worker only bridges CORS.
