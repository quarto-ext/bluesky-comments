-- Register HTML dependencies for the shortcode
local function ensureHtmlDeps()
  quarto.doc.add_html_dependency({
    name = 'bluesky-comments',
    version = '1.0.0',
    scripts = {'bluesky-comments.js'},
    stylesheets = {'styles.css'}
  })
end


-- Main shortcode function
function shortcode(args, kwargs, _)
  -- Only process for HTML formats with JavaScript enabled
  if not quarto.doc.is_format("html:js") then
    return pandoc.Null()
  end

  -- Ensure HTML dependencies are added
  ensureHtmlDeps()

  -- Get URI from kwargs or default to empty string
  local uri = kwargs['uri'] or ''

  -- Return the HTML div element
  return pandoc.RawBlock('html', string.format([[
    <div class="bluesky-comments" data-uri="%s"></div>
  ]], uri))
end

-- Return the shortcode registration
return {
  ['bluesky-comments'] = shortcode
}