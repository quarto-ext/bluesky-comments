# Bluesky Comments Extension for Quarto <img src="https://github.com/user-attachments/assets/260e97ce-6941-4f3a-8dc8-b7125522ebc0" align="right" alt="Logo: A butterfly in the blue sky with comments" width="150"/>

> Enable Bluesky social discussions in your Quarto documents

Bluesky Comments is a Quarto shortcode extension that seamlessly integrates Bluesky post comments into your documents. This extension dynamically fetches and displays threaded conversations from Bluesky, creating an interactive bridge between your content and social discussions.

> [!WARNING]
>
> `bluesky-comments` is under active development and the API may change as we iterate. Early adopters and feedback are welcome!

## Installation

You can install this extension using Quarto's extension management system:

```bash
quarto add quarto-ext/bluesky-comments
```

This will install the extension under the `_extensions` directory of your Quarto project.

### Requirements

- Quarto version 1.5.0 or higher
- A web browser with JavaScript enabled

## Usage

To embed comments from a Bluesky post, use the `bluesky-comments` shortcode in your Quarto document:

````markdown
{{{< bluesky-comments at://did.plc/rkey >}}}
````

### Converting Bluesky URLs to AT Protocol URIs

To get the correct URI format, use the [Bluesky/AT Protocol URL ↔ Identifier Converter](https://web-apps.thecoatlessprofessor.com/bluesky/profile-or-post-to-did-at-uri.html).

For example:

1. **Original URL:**
   ```
   https://bsky.app/profile/coatless.bsky.social/post/3lbtwdydxrk26
   ```

2. **Converted AT-URI:**
   ```
   at://did:plc:fgeozid7uyx2lfz3yo7zvm3b/app.bsky.feed.post/3lbtwdydxrk26
   ```

3. **Final shortcode:**
   ````markdown
   {{< bluesky-comments at://did:plc:fgeozid7uyx2lfz3yo7zvm3b/app.bsky.feed.post/3lbtwdydxrk26 >}}
   ````

## Configuration

The extension can be configured through your document's YAML frontmatter or the `_quarto.yml` configuration file. Add configuration options under the `bluesky-comments` key:

```yaml
---
title: "My Document"
bluesky-comments:
  mute-patterns:
    - "📌"
    - "🔥"
    - "/\\bspam\\b/i"  # regex pattern
  mute-users:
    - "did:plc:1234abcd"
  filter-empty-replies: true
  visible-comments: 3
  visible-subcomments: 3
---
```

### Available Options

- `mute-patterns`: An array of strings or regex patterns (enclosed in `/`) to filter out comments containing specific text
- `mute-users`: An array of Bluesky DIDs to filter out comments from specific users
- `filter-empty-replies`: Boolean flag to filter out empty or very short replies (default: `true`)
- `visible-comments`: Number of top-level comments to show initially (default: `3`)
- `visible-subcomments`: Number of replies to show initially under each comment (default: `3`)

Users can click "Show more" buttons to reveal additional comments and replies beyond these initial limits. Filtered comments are counted and displayed at the top of the comments section to maintain transparency about moderation.

## Styling

Modify the extension's appearance by overriding CSS classes in:

```defaults
_extensions/bluesky-comments/styles.css
```

## Limitations

- Only works in HTML output formats with JavaScript enabled
- Subject to Bluesky's API rate limits and availability

## Acknowledgements

This extension builds upon the innovative work of:

- [Emily Liu](https://emilyliu.me/blog/comments) - [Original concept](https://bsky.app/profile/emilyliu.me/post/3lbqta5lnck2i)
- [Samuel Newman](https://bsky.app/profile/samuel.bsky.team) - [Implementation details](https://graysky.app/blog/2024-02-05-adding-blog-comments)
