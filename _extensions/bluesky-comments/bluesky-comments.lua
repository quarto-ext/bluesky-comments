local bluesky = require("bluesky-api")
local utils = require("utils")

-- These attributes become part of `filter-config` JSON and aren't added to the
-- custom element as attributes.
local filter_config_attrs = {
  ["mute-patterns"] = true,
  ["mute-users"] = true,
  ["filter-empty-replies"] = true,
  -- legacy attributes
  ["visible-comments"] = true,
  ["visible-subcomments"] = true
}


-- Get filter configuration from meta
local function getFilterConfig(config)
  if not config then
    return '{}'
  end

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
    utils.log_warn("`visible-comments` is deprecated and no longer used, please use `n-show-init` instead.")
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

local function mergeKwargsWithMeta(kwargs, meta)
  local attrs = {}

  for key, value in pairs(meta and meta["bluesky-comments"]) do
    if filter_config_attrs[key] then
      -- attributes from metadata pass through directly
      attrs[key] = value
    else
      attrs[key] = pandoc.utils.stringify(value)
    end
  end


  -- Add any additional attributes from kwargs
  for key, value in pairs(kwargs) do
    -- Validate that key is a string
    if type(key) ~= "string" then
      error("Invalid key: " .. tostring(key) .. ". Keys must be strings.")
    end

    -- Handle different value types
    if type(value) ~= "string" then
      error("Invalid value for '" .. key .. "'. Values must be strings.")
    end

    if filter_config_attrs[key] then
      value = quarto.json.decode(value)
    end

    if key == "mute-patterns" or key == "mute-users" then
      if attrs[key] then
        -- merge with global metadata mute settings rather than overriding
        for i = 1, #value do
          table.insert(attrs[key], value[i])
        end
      else
        attrs[key] = value
      end
    elseif key ~= "uri" then
      attrs[key] = value
    end
  end

  return attrs
end

local function attrsFromKwargsMeta(kwargs)
  local ret = ""
  for key, value in pairs(kwargs) do
    if filter_config_attrs[key] then
      goto continue
    end

    if value == "true" then
      ret = ret .. " " .. key
    elseif value ~= "false" then
      ret = ret .. " " .. key .. "=\"" .. value .. "\""
    end

    ::continue::
  end

  return ret
end

-- Main shortcode function
function shortcode(args, kwargs, meta)
  -- Only process for HTML formats with JavaScript enabled
  if not quarto.doc.is_format("html:js") then
    return pandoc.Null()
  end

  -- Merge kwargs with global meta. Users can set inline attributes or use
  -- `bluesky-comments` in YAML front-matter or _quarto.yml.
  local kwargsWithMeta = mergeKwargsWithMeta(kwargs, meta)

  -- Get filter configuration from metadata
  local filterConfig = getFilterConfig(kwargsWithMeta)

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
    errorMsg = errorMsg or
        "Shortcode requires the Bluesky post URL, AT-proto URI, or post record key as an unnamed argument."
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

  local attrs = attrsFromKwargsMeta(kwargsWithMeta)

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
