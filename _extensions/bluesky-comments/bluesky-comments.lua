local bluesky = require("bluesky-api")
local utils = require("utils")


-- Get filter configuration from meta
local function getFilterConfig(config)
  if not config then
    return '{}'
  end

  quarto.log.output(config)

  local filterConfig = {
    mutePatterns = {},
    muteUsers = {},
    filterEmptyReplies = true
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
    utils.log_warn("`visible-comments` was deprecated, please use `n-show-init` instead.")
    filterConfig.visibleComments = tonumber(pandoc.utils.stringify(config['visible-comments']))
  end

  if config['visible-subcomments'] then
    utils.log_warn("`visible-subcomments` is deprecated and no longer used, please use `n-show-init` instead.")
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

local function composePostUri(postUri, profile)
  postUri = pandoc.utils.stringify(postUri or "")

  if postUri:match("^at://") or postUri:match("^https?://") then
    return postUri
  end

  if postUri == "" then
    -- TODO: look up the postUri from meta
    return postUri
  end

  local profile = pandoc.utils.stringify(profile or "")

  if profile == "" then
    return utils.abort(
      "Post record key " .. postUri ..
      " provided but `bluesky-comments.profile` metadata is not set."
    )
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

  -- Get filter configuration from metadata
  local filterConfig = getFilterConfig(meta and meta["bluesky-comments"])

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
    utils.abort(errorMsg)
    return ""
  end

  local profile = pandoc.utils.stringify(kwargs['profile'])
  if profile == "" then
    profile = meta and meta['bluesky-comments'] and meta["bluesky-comments"]['profile']
  end

  postUri = composePostUri(postUri, profile)
  if (postUri or "") == "" then
    return ""
  end

  local atUri = bluesky.convertUrlToAtUri(postUri)
  if atUri and atUri ~= '' then
    postUri = atUri
  end

  local attrs = ""
  -- Add any additional attributes from kwargs
  for key, value in pairs(kwargs) do
    -- Validate that key is a string
    if type(key) ~= "string" then
      error("Invalid kwarg key: " .. tostring(key) .. ". Keys must be strings.")
    end

    -- Handle different value types
    if type(value) == "string" then
      if value == "true" then
        attrs = attrs .. " " .. key
      elseif value ~= "false" then
        attrs = attrs .. " " .. key .. "=\"" .. value .. "\""
      end
    else
      error("Invalid kwarg value for '" .. key .. "'. Values must be strings.")
    end
  end

  -- Return the HTML div element with config
  return pandoc.RawBlock('html', string.format([[
    <bluesky-comments
         post="%s"
         filter-config='%s'%s></bluesky-comments>
  ]], postUri, quarto.json.encode(filterConfig), attrs))
end

-- Return the shortcode registration
return {
  ['bluesky-comments'] = shortcode
}
