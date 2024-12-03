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
    error("Invalid Bluesky URL format")
  end
  return handle, postId
end

-- Global cache for resolved handles
local BSKY_RESOLVED_HANDLES = _G.BSKY_RESOLVED_HANDLES or {}
_G.BSKY_RESOLVED_HANDLES = BSKY_RESOLVED_HANDLES

-- Resolve a handle to a DID.
-- See <https://docs.bsky.app/docs/advanced-guides/resolving-identities>.
---@param handle string The user's handle to be resolved
---@return string did The resolved DID for the user
function BlueskyAPI.resolveHandle(handle)
  if BSKY_RESOLVED_HANDLES[handle] ~= nil then
    return BSKY_RESOLVED_HANDLES[handle]
  end

  local url = string.format("%s/xrpc/com.atproto.identity.resolveHandle?handle=%s", BASE_API_URL, handle)

  quarto.log.info("[bluesky-comments] Request: " .. url)
  local mt, contents = pandoc.mediabag.fetch(url)
  quarto.log.info("[bluesky-comments] Response: ", contents)

  if not contents then
    error("Failed to resolve handle: " .. handle)
  end

  local data = quarto.json.decode(contents)
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

  quarto.log.info("[bluesky-comments] Resolving post: " .. url)

  local atUri
  local success, err = pcall(function()
    local handle, postId = extractPostInfo(url)
    local did = BlueskyAPI.resolveHandle(handle)
    atUri = BlueskyAPI.createAtUri(did, postId)
  end)

  if not success then
    quarto.log.error("Error resolving aturi for post " .. url .. ". Error: " .. err)
    return nil
  end

  quarto.log.info("[bluesky-comments] Resolved aturi: " .. atUri)
  return atUri
end

return BlueskyAPI
