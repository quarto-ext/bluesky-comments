# Bluesky Comments Extension for Quarto <img src="https://github.com/user-attachments/assets/260e97ce-6941-4f3a-8dc8-b7125522ebc0" align="right" alt="Logo: A butterfly in the blue sky with comments" width="150"/>

> Enable Bluesky social discussions in your Quarto documents

Bluesky Comments is a Quarto shortcode extension that seamlessly integrates Bluesky post comments into your documents. This extension dynamically fetches and displays threaded conversations from Bluesky, creating an interactive bridge between your content and social discussions.

## Installation

You can install this extension using Quarto's extension management system:

```bash
quarto add coatless-quarto/bluesky-comments
```

This will install the extension under the `_extensions` directory of your Quarto project.

### Requirements

- Quarto version 1.5.0 or higher
- A web browser with JavaScript enabled

## Usage

To embed comments from a Bluesky post, use the `bluesky-comments` shortcode in your Quarto document:

````markdown
{{{< bluesky-comments uri="at://did.plc/rkey" >}}}
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
   {{< bluesky-comments uri="at://did:plc:fgeozid7uyx2lfz3yo7zvm3b/app.bsky.feed.post/3lbtwdydxrk26" >}}
   ````

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
