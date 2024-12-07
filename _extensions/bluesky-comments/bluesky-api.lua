local utils = require("utils")

local BlueskyAPI = {}

-- Base Bluesky API URL
local BASE_API_URL = "https://api.bsky.app"
local BASE_APP_URL = "https://bsky.app"


-- Extract handle and post ID from a Bluesky URL
-- Example: https://bsky.app/profile/handle.bsky.social/post/1234
---@param url string A Bluesky post URL
---@return string handle The extracted user's handle
---@return string postId The extracted post ID
local function extractPostInfo(url)
  local handle, postId = url:match("bsky%.app/profile/([^/]+)/post/([^/]+)")
  if not handle or not postId then
    utils.abort("Invalid Bluesky URL format: " .. url)
    return "", ""
  end
  return handle, postId
end

-- Global cache for resolved handles
local BSKY_RESOLVED_HANDLES = _G.BSKY_RESOLVED_HANDLES or {}
_G.BSKY_RESOLVED_HANDLES = BSKY_RESOLVED_HANDLES

-- Resolve a handle to a DID.
-- See <https://docs.bsky.app/docs/advanced-guides/resolving-identities>.
---@param handle string The user's handle to be resolved
---@return string|nil did The resolved DID for the user
function BlueskyAPI.resolveHandle(handle)
  if BSKY_RESOLVED_HANDLES[handle] ~= nil then
    return BSKY_RESOLVED_HANDLES[handle]
  end

  local url = string.format("%s/xrpc/com.atproto.identity.resolveHandle?handle=%s", BASE_API_URL, handle)

  utils.log_info("Request: " .. url)
  local mt, contents = pandoc.mediabag.fetch(url)
  utils.log_info("Response: ", contents)

  if not contents then
    utils.abort("Failed to resolve handle: " .. handle)
    return nil
  end

  local data = quarto.json.decode(contents)
  if data.error then
    utils.abort(string.format(
      "Failed to resolve handle '%s'. %s: %s",
      handle, data.error, data.message or ""
    ))
    return nil
  end

  BSKY_RESOLVED_HANDLES[handle] = data.did   -- Cache the resolved DID
  return data.did
end

-- Create an AT Protocol URI from a DID and post ID
---@param did string
---@param postId string
---@return string
function BlueskyAPI.createAtUri(did, postId)
  return string.format("at://%s/app.bsky.feed.post/%s", did, postId)
end

-- Create a Bluesky post URL from a handle and post ID
---@param handle string
---@param postId string
---@return string
function BlueskyAPI.createPostUrl(handle, postId)
  return string.format("%s/profile/%s/post/%s", BASE_APP_URL, handle, postId)
end

-- Global cache for resolved URIs
local BSKY_RESOLVED_URIS = _G.BSKY_RESOLVED_URIS or {}
_G.BSKY_RESOLVED_URIS = BSKY_RESOLVED_URIS

---Convert a Bluesky post URL to an atproto URI
---
---See <https://docs.bsky.app/docs/advanced-guides/posts> and
---<https://web-apps.thecoatlessprofessor.com/bluesky/profile-or-post-to-did-at-uri.html>.
---@param url string The URL to convert, possibly already an `at://` URI
---@return string|nil atUri Returns the resolved atproto URI for the post, or `nil` if unable to convert the post URL.
function BlueskyAPI.convertUrlToAtUri(url)
  if url:match("^at://") then
    return url
  end

  utils.log_info("Resolving post: " .. url)

  local handle, postId = extractPostInfo(url)
  if handle == "" then
    return nil
  end

  local did
  local success, err = pcall(function()
    did = BlueskyAPI.resolveHandle(handle)
  end)

  if err or not did then
    return nil
  end

  local atUri = BlueskyAPI.createAtUri(did, postId)

  if BSKY_RESOLVED_URIS[url] == nil then
    utils.log_output(
      "Resolved Bluesky post:" ..
      "\n    source: " .. url ..
      "\n  resolved: " .. atUri
    )
    BSKY_RESOLVED_URIS[url] = atUri
  end

  utils.log_info("Resolved aturi: " .. atUri)
  return atUri
end

return BlueskyAPI
