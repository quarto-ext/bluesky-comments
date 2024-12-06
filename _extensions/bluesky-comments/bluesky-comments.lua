local bluesky = require("bluesky-api")


-- Get filter configuration from meta
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

  -- Add any additional config values
  for key, value in pairs(config) do
    -- Convert key from kebab-case to camelCase
    local camelKey = key:gsub("%-(%w)", function(match) return match:upper() end)
    -- Only add if not already in filterConfig
    if filterConfig[camelKey] == nil then
      filterConfig[camelKey] = pandoc.utils.stringify(value)
    end
  end

  return filterConfig
end

-- Register HTML dependencies for the shortcode
local function ensureHtmlDeps()
  quarto.doc.add_html_dependency({
    name = 'bluesky-comments',
    version = '1.0.0',
    scripts = { 'bluesky-comments.js' },
    stylesheets = { 'styles.css' }
  })
end

local function composePostUri(postUri, config)
  postUri = pandoc.utils.stringify(postUri or "")

  if postUri:match("^at://") or postUri:match("^https?://") then
    return postUri
  end

  if postUri == "" then
    -- TODO: look up the postUri from meta
    return postUri
  end

  local profile = pandoc.utils.stringify(config.profile or "")

  if profile == "" then
    quarto.log.error(
      "[bluesky-comments] Post record key " .. postUri ..
      " provided but `bluesky-comments.profile` metadata is not set."
    )
    return ''
  end

  if profile:match("^did:") then
    return bluesky.createAtUri(profile, postUri)
  end

  return bluesky.createPostUrl(profile, postUri)
end

-- Main shortcode function
function shortcode(args, kwargs, meta)
  -- Only process for HTML formats with JavaScript enabled
  if not quarto.doc.is_format("html:js") then
    return pandoc.Null()
  end

  -- Get configuration
  local config = getFilterConfig(meta)

  -- Ensure HTML dependencies are added
  ensureHtmlDeps()

  -- Handle post URI from either kwargs or args
  local postUri = nil
  local errorMsg = nil

  -- Simplify post kwarg. In shortcodes, kwargs is a table of pandoc inlines
  kwargsUri = pandoc.utils.stringify(kwargs['uri'])

  if kwargsUri ~= '' and #args > 0 then
    if kwargsUri ~= args[1] then
      errorMsg = string.format([[Cannot provide both named and unnamed arguments for post URI:
    * uri="%s"
    * %s]], kwargsUri, args[1])
    else
      postUri = args[1]
    end
  elseif kwargsUri ~= '' then
    postUri = kwargsUri
  elseif #args == 1 then
    postUri = args[1]
  end

  if postUri == nil then
    errorMsg = errorMsg or "Shortcode requires the Bluesky post URL, AT-proto URI, or post record key as an unnamed argument."
    quarto.log.error("[bluesky-comments] " .. errorMsg)
    return ""
  end

  postUri = composePostUri(postUri, config)
  if postUri == "" then
    return ""
  end

  local atUri = bluesky.convertUrlToAtUri(postUri)
  if atUri and atUri ~= '' then
    postUri = atUri
  end

  -- Return the HTML div element with config
  return pandoc.RawBlock('html', string.format([[
    <bluesky-comments
         post="%s"
         config='%s'></bluesky-comments>
  ]], postUri, quarto.json.encode(config)))
end

-- Return the shortcode registration
return {
  ['bluesky-comments'] = shortcode
}
