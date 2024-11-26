# Bluesky Comments Extension for Quarto <img src="https://github.com/user-attachments/assets/260e97ce-6941-4f3a-8dc8-b7125522ebc0" align ="right" alt="Logo: A a butterfly in the blue sky with comments" width ="150"/>

Bluesky Comments is a Quarto shortcode extension that enables embedding Bluesky post comments in your documents. This extension fetches and displays comments from Bluesky posts, allowing you to integrate social discussions directly into your Quarto documents.

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

Replace `did.plc` with the author's DID and `rkey` with the post's record key. You can get these from any Bluesky post URL by using the following [Bluesky/AT Protocol URL ↔ Identifier Converter](https://web-apps.thecoatlessprofessor.com/bluesky/profile-or-post-to-did-at-uri.html) tool.

For example, if your Bluesky post URL is `https://bsky.app/profile/coatless.bsky.social/post/3lbtwdydxrk26`, the tool would provide the following AT-URI: `at://did:plc:fgeozid7uyx2lfz3yo7zvm3b/app.bsky.feed.post/3lbtwdydxrk26`. 

In this case, your shortcode would look like:

````markdown
{{{< bluesky-comments uri="at://did:plc:fgeozid7uyx2lfz3yo7zvm3b/app.bsky.feed.post/3lbtwdydxrk26" >}}}
````

## Styling

The extension comes with default styling that matches Bluesky's aesthetic. You can customize the appearance by overriding the CSS classes defined in [`_extensions/bluesky-comments/styles.css`](_extensions/bluesky-comments/styles.css).

## Technical Details

The extension works by:

1. Making requests to the public Bluesky API (`public.api.bsky.app`)
2. Fetching thread data for the specified post
3. Rendering comments in a responsive layout
4. Automatically handling pagination through the "Show more" button

## Limitations

- Only works in HTML output formats with JavaScript enabled
- Requires an internet connection to fetch comments
- Subject to Bluesky's API rate limits and availability

## Acknowledgements

This extension is based off of the work of [Emily Liu](https://emilyliu.me/blog/comments) ([Original tweet? that caught my attention](https://bsky.app/profile/emilyliu.me/post/3lbqta5lnck2i)) and [Samuel Newman](https://bsky.app/profile/samuel.bsky.team) ([Original blog post](https://graysky.app/blog/2024-02-05-adding-blog-comments)). 
