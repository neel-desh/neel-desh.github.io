# Cloudflare edge rules

GitHub Pages cannot negotiate content or set custom headers, and this site is
static forever, so two agent-readiness checks live at the Cloudflare layer.
These rules are applied by hand in the dashboard and are **not** deployed by
this repo. Re-apply them if the zone is ever rebuilt.

Apply after the branch is deployed to `main`, since the markdown twins must
exist on the origin first. Rules are in the dashboard under **Rules**. All
three are available on the free plan.

## Rule 1: serve markdown when asked

Rules > Transform Rules > **Rewrite URL** > Create rule.

- Name: `agents: markdown by Accept header`
- When incoming requests match, **Edit expression**:

  ```
  (any(http.request.headers["accept"][*] contains "text/markdown") and ends_with(http.request.uri.path, "/"))
  ```

- Then: Path > **Rewrite to...** > Dynamic:

  ```
  concat(http.request.uri.path, "index.md")
  ```

- Query: Preserve.

The rewrite happens before the cache lookup, so the cache key is the rewritten
URL and the HTML and markdown variants never collide.

## Rule 2: discovery Link header on pages

Rules > Transform Rules > **Modify Response Header** > Create rule.

- Name: `agents: Link header on HTML`
- Expression:

  ```
  (http.response.content_type.media_type eq "text/html")
  ```

- Then: **Set static**, header `Link`, value:

  ```
  </llms.txt>; rel="describedby"; type="text/plain", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </sitemap.xml>; rel="sitemap"; type="application/xml"
  ```

## Rule 3: Vary on both variants

Rules > Transform Rules > **Modify Response Header** > Create rule.

- Name: `agents: Vary Accept`
- Expression:

  ```
  (http.response.content_type.media_type in {"text/html" "text/markdown"})
  ```

- Then: **Add**, header `Vary`, value `Accept`.

## Fallback rule: only if markdown has the wrong content type

Check first (see below). If `index.md` is not served as `text/markdown`, add a
Modify Response Header rule with expression
`(ends_with(http.request.uri.path, ".md"))` that sets `Content-Type` to
`text/markdown; charset=utf-8`. If it is already correct, skip this rule.

## Verify

Purge the cache for the site after saving the rules, then:

```bash
# Twin is reachable directly, as markdown
curl -sI https://neeldeshmukh.com/experience/index.md | grep -i '^content-type'
#   expect: content-type: text/markdown...

# Accept negotiation returns markdown at the page URL
curl -s -H 'Accept: text/markdown' https://neeldeshmukh.com/experience/ | head -6
#   expect: starts with "---" then title: ...
curl -sI -H 'Accept: text/markdown' https://neeldeshmukh.com/experience/ | grep -i '^content-type'
#   expect: content-type: text/markdown...

# Browsers are unaffected
curl -sI https://neeldeshmukh.com/experience/ | grep -i '^content-type'
#   expect: content-type: text/html...

# Discovery headers on pages
curl -sI https://neeldeshmukh.com/ | grep -i '^link\|^vary'
#   expect: a link: header naming llms.txt, agent-skills and sitemap, and vary: including Accept
```

Then scan the site at https://isitagentready.com. Expected to pass: robots.txt,
sitemap, Link headers, markdown negotiation, llms.txt, Content Signals, AI bot
rules, Agent Skills. Expected not applicable: API catalog, MCP server card,
OAuth, WebMCP, Web Bot Auth, commerce (a static site has no server to describe).
