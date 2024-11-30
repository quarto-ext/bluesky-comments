-- Get filter configuration from meta and convert to JSON
local function getFilterConfig(meta)
  -- Access the extension configuration from meta
  local config = meta and meta['bluesky-comments']
  if not config then
    return '{}'
  end

  -- Extract filter configuration with defaults
  local filterConfig = {
    mutePatterns = {},
    muteUsers = {},
    filterEmptyReplies = true,
    visibleComments = 3,
    visibleSubComments = 3
  }

  -- Process mute patterns if present
  if config['mute-patterns'] then
    for _, pattern in ipairs(config['mute-patterns']) do
      table.insert(filterConfig.mutePatterns, pandoc.utils.stringify(pattern))
    end
  end

  -- Process mute users if present
  if config['mute-users'] then
    for _, user in ipairs(config['mute-users']) do
      table.insert(filterConfig.muteUsers, pandoc.utils.stringify(user))
    end
  end

  -- Process boolean and numeric options
  if config['filter-empty-replies'] ~= nil then
    filterConfig.filterEmptyReplies = config['filter-empty-replies']
  end

  if config['visible-comments'] then
    filterConfig.visibleComments = tonumber(pandoc.utils.stringify(config['visible-comments']))
  end

  if config['visible-subcomments'] then
    filterConfig.visibleSubComments = tonumber(pandoc.utils.stringify(config['visible-subcomments']))
  end

  -- Convert to JSON string
  return quarto.json.encode(filterConfig)
end

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
function shortcode(args, kwargs, meta)
  -- Only process for HTML formats with JavaScript enabled
  if not quarto.doc.is_format("html:js") then
    return pandoc.Null()
  end

  -- Ensure HTML dependencies are added
  ensureHtmlDeps()

  -- Get URI from kwargs or default to empty string
  local uri = kwargs['uri'] or ''

  -- Get configuration
  local config = getFilterConfig(meta)

  -- Return the HTML div element with config
  return pandoc.RawBlock('html', string.format([[
    <bluesky-comments
         data-uri="%s"
         data-config='%s'></bluesky-comments>
  ]], uri, config))
end

-- Return the shortcode registration
return {
  ['bluesky-comments'] = shortcode
}
