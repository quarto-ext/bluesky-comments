local bluesky = require("bluesky-api")
local utils = require("utils")


-- Get filter configuration from meta
local function getFilterConfig(config)
  if not config then
    return '{}'
  end

  quarto.log.output(config)

  -- Extract filter configuration with defaults
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

  if config['n-show-init'] then
    filterConfig.nShowInit = tonumber(pandoc.utils.stringify(config['n-show-init']))
  end

  if config['visible-comments'] then
    utils.log_warn("`visible-comments` was deprecated, please use `n-show-init` instead.")
    filterConfig.visibleComments = tonumber(pandoc.utils.stringify(config['visible-comments']))
  end

  if config['visible-subcomments'] then
    utils.log_warn("`visible-subcomments` was deprecated, please use `n-show-init` instead.")
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

  -- Get configuration, merging kwargs with yaml frontmatter
  local metaConfig = meta and meta["bluesky-comments"]
  for k,v in pairs(kwargs) do metaConfig[k] = v end
  local config = getFilterConfig(metaConfig)

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

  postUri = composePostUri(postUri, config)
  if (postUri or "") == "" then
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
