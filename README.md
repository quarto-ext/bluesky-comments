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

This will install the extension under the `_extensions` directory of your Quarto project. If you're using version control, you should commit this directory.

## Usage

To embed comments from a Bluesky post, use the `bluesky-comments` shortcode in your Quarto document:

````markdown
{{< bluesky-comments https://bsky.app/profile/coatless.bsky.social/post/3lbtwdydxrk26 >}}
````

When someone visits your web page, any replies to the linked post are pulled from Bluesky and shown directly in the page.

Learn more about the Bluesky comments extension:

* [Usage](https://quarto-ext.github.io/bluesky-comments/index.html#usage)
* [Configuration](https://quarto-ext.github.io/bluesky-comments/index.html#configuration)
* [Moderation](https://quarto-ext.github.io/bluesky-comments/index.html#moderation)
* [Styling](https://quarto-ext.github.io/bluesky-comments/index.html#styling)
* [Examples](https://quarto-ext.github.io/bluesky-comments/examples.html)


## Limitations

- Only works in HTML output formats with JavaScript enabled
- Subject to Bluesky's API rate limits and availability

## Acknowledgements

This extension builds upon the innovative work of:

- [Emily Liu](https://emilyliu.me/blog/comments) - [Original concept](https://bsky.app/profile/emilyliu.me/post/3lbqta5lnck2i)
- [Samuel Newman](https://bsky.app/profile/samuel.bsky.team) - [Implementation details](https://graysky.app/blog/2024-02-05-adding-blog-comments)
- [Jonathan Moallem](https://capscollective.com/) - [Rich text and image embedding](https://capscollective.com/blog/bluesky-blog-comments/)
