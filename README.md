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
{{< bluesky-comments at://did.plc/rkey >}}
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
  n-show-init: 3
  n-show-more: 2
---
```

### Available Options

- `mute-patterns`: An array of strings or regex patterns (enclosed in `/`) to filter out comments containing specific text
- `mute-users`: An array of Bluesky DIDs to filter out comments from specific users
- `filter-empty-replies`: Boolean flag to filter out empty or very short replies (default: `true`)
- `n-show-init`: Number of top-level comments to show initially (default: `3`)
- `n-show-more`: Number of replies to reveal when the user clicks on the "Show more" button (default: `2`)

Users can click "Show more" buttons to reveal additional comments and replies beyond these initial limits. Filtered comments are counted and displayed at the top of the comments section to maintain transparency about moderation.

## Styling

The extension uses Bootstrap theme variables if set by default. For further customization, you can override these variables in your document's or theme CSS. We also offer the ability to use component-specific variables to style the comments slightly different than your original website.

### Using Bootstrap Variables

By default, the component inherits from Bootstrap's theme. You can override the following variables to affect all Bootstrap-styled components:

```css
:root {
  --bs-body-color: #333;
  --bs-link-color: #0070f3;
  --bs-border-color: #eaeaea;
}
```

### Using Component Variables

For more targeted styling, override the component's custom properties either in your document's CSS or in a custom CSS file under the theme:

```css
:root {
  --bc-text-color: #333;        /* Main text color */
  --bc-muted-text: #666;        /* Secondary text */
  --bc-link-color: #0070f3;     /* Links */
  --bc-border-color: #eaeaea;   /* Borders */
  --bc-thread-line: #e1e1e1;    /* Reply thread line color */
}
```

#### Available CSS Variables

You may specify these variables in your document's CSS or in a custom CSS file under the theme to customize the appearance of the comments section.

| Variable | Purpose | Default |
|----------|---------|---------|
| `--bc-text-color` | Primary text | `var(--bs-body-color)` |
| `--bc-muted-text` | Secondary text | `var(--bs-secondary-color)` |
| `--bc-link-color` | Link color | `var(--bs-link-color)` |
| `--bc-link-hover-color` | Link hover color | `var(--bs-link-hover-color)` |
| `--bc-notice-bg` | Notice background | `var(--bs-light)` |
| `--bc-avatar-bg` | Avatar placeholder | `var(--bs-secondary-bg)` |
| `--bc-avatar-size` | Avatar size | `24px` |
| `--bc-border-color` | General borders | `var(--bs-border-color)` |
| `--bc-thread-line` | Reply thread lines | `var(--bs-border-color)` |
| `--bc-thread-line-width` | Reply thread line width | `2px` |
| `--bc-warning-text` | Content warning text | `var(--bc-muted-fg)` |
| `--bc-warning-bg` | Warning background | `var(--bc-muted-bg)` |
| `--bc-warning-button` | Warning button | `var(--bs-primary)` |
| `--bc-muted-bg` | Muted background | `--bs-emphasis-color-rgb` at 0.5% alpha |
| `--bc-muted-fg` | Muted foreground | `--bs-emphasis-color-rgb` at 65% alpha |


## Limitations

- Only works in HTML output formats with JavaScript enabled
- Subject to Bluesky's API rate limits and availability

## Acknowledgements

This extension builds upon the innovative work of:

- [Emily Liu](https://emilyliu.me/blog/comments) - [Original concept](https://bsky.app/profile/emilyliu.me/post/3lbqta5lnck2i)
- [Samuel Newman](https://bsky.app/profile/samuel.bsky.team) - [Implementation details](https://graysky.app/blog/2024-02-05-adding-blog-comments)
