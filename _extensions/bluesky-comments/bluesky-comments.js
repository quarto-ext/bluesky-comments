// @ts-check

/**
 * Custom element for displaying Bluesky comments.
 */
class BlueskyComments extends HTMLElement {
  constructor() {
    super();
    /** @private {boolean} */
    this._initialized = false;
    /** @type {string|null} */
    this.post = null;
    /** @type {any} */
    this.thread = null;
    /** @type {string|null} */
    this.error = null;
    /** @type {number} Track number of filtered comments */
    this.filteredCount = 0;
    /**
     * @type {{
     *  mutePatterns: string[],
     *  muteUsers: string[],
     *  filterEmptyReplies: boolean
     * }}
     */
    this.filterConfig = {
      mutePatterns: [],
      muteUsers: [],
      filterEmptyReplies: true,
    };
    /** @type {string|null} */
    this.profile = null;
    /** @type {number} */
    this.nShowInit = 3;
    /** @type {number} */
    this.nShowMore = 2;
    /** @type {number} */
    this.nShowDepth = 3;
    /** @type {boolean|string} */
    this.header = false;
    /**
     * A map to track the number of visible replies by post id.
     * @type {Map<string, number>}
     */
    this.postVisibilityCounts = new Map();
    /** @type {Set<string>} */
    this.postVisibilityDepths = new Set();
    /** @type {any[]} Replies that are hidden or moderated via Bluesky */
    this.hiddenReplies = [];

    // Bind methods
    this.showMoreReplies = this.showMoreReplies.bind(this);
    this.showMoreDepth = this.showMoreDepth.bind(this);
  }

  /**
   * Gets the HTTP URL of the post.
   * @returns {string}
   */
  get postUrl() {
    return this.#convertToHttpUrl(this.post);
  }

  /**
   * Observed attributes for the custom element.
   * @returns {string[]}
   */
  static get observedAttributes() {
    return ['post', 'profile'];
  }

  /**
   * Called when the element is connected to the DOM.
   * Sets up configuration and fetches the thread data.
   * @returns {Promise<void>}
   */
  async connectedCallback() {
    this.render();

    const configStr = this.getAttribute('filter-config');

    // Parse configuration
    if (configStr) {
      try {
        const userConfig = JSON.parse(configStr);
        this.filterConfig = { ...this.filterConfig, ...userConfig };
      } catch (err) {
        console.error('Error parsing config:', err);
      }
    }

    // n-show- attributes
    [
      { attr: 'n-show-init', prop: 'nShowInit' },
      { attr: 'n-show-more', prop: 'nShowMore' },
      { attr: 'n-show-depth', prop: 'nShowDepth' },
    ].forEach(({ attr, prop }) => {
      let value = this.getAttribute(attr);
      if (!value) return;
      if (typeof value !== 'number') {
        value = parseInt(value);
        if (!isNaN(value)) {
          this[prop] = Math.max(value, 1);
        }
      }
    });

    this.profile = this.getAttribute('profile');

    if (this.hasAttribute('header')) {
      this.header = this.getAttribute('header');
    }

    this.#setPostUri(this.getAttribute('post'));

    // Initialize root post visibility count
    this.postVisibilityCounts.set('root', this.nShowInit);

    if (!this._initialized) {
      this._initialized = true;
      this.#loadThread();
    }
  }

  /**
   * Called when an observed attribute changes.
   * @param {string} name - The name of the attribute.
   * @param {string|null} oldValue - The previous value.
   * @param {string|null} newValue - The new value.
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._initialized) {
      // connectedCallback handles first load but is async
      return;
    }
    if (oldValue === newValue) return;

    if (name === 'post') {
      this.#setPostUri(newValue);
      this.#loadThread();
    }

    if (name == 'profile') {
      this.profile = newValue;
    }
  }

  /**
   * Sets the post URI from the given attribute value.
   * @param {string|null} newValue - The new post attribute value.
   */
  #setPostUri(newValue) {
    if (newValue && !/^(https?|at):\/\//.test(newValue)) {
      const rkey = newValue;
      if (this.profile) {
        if (this.profile.startsWith('did:')) {
          newValue = this.createAtProtoUri({ did: this.profile, rkey });
        } else {
          newValue = this.createPostUrl({ profile: this.profile, rkey });
        }
      }
    }
    this.post = this.#convertToAtProtoUri(newValue);
  }

  /**
   * Loads thread data for the current post.
   * @returns {Promise<void>}
   */
  async #loadThread() {
    if (!this.post) {
      this.error = 'Post link (or at:// URI) is required';
      this.render();
      return;
    }

    if (this.thread && this.thread.post.uri === this.post) {
      // We've already downloaded the thread, no need to update
      return;
    }

    try {
      await this.#fetchThreadData();
      this.#logAtUri();
      this.render();
    } catch (error) {
      console.error('[bluesky-comments] Error loading comments', error);
      this.error = 'Error loading comments';
      this.render();
    }
  }

  /**
   * Converts a given URI to an AT-protocol URI.
   * @param {string} uri - The input URI.
   * @returns {string|null} The AT-protocol URI or null if invalid.
   */
  #convertToAtProtoUri(uri) {
    if (uri.startsWith('at://')) return uri;

    const match = uri.match(/profile\/([a-zA-Z0-9._:%-]+)\/post\/([\w]+)/);
    if (match) {
      const [, did, rkey] = match;
      return this.createAtProtoUri({ did, rkey });
    }

    this.error = 'Invalid Bluesky post URL format';
    return null;
  }

  /**
   * Creates an AT-protocol URI using the given DID and rkey.
   * @param {{did: string, rkey: string}} param0 - An object containing the DID and rkey.
   * @returns {string} The generated AT-protocol URI.
   */
  createAtProtoUri({ did, rkey }) {
    return `at://${did}/app.bsky.feed.post/${rkey}`;
  }

  /**
   * Converts a given URI to its HTTP URL.
   * @param {string} uri - The input URI.
   * @returns {string} The HTTP URL.
   */
  #convertToHttpUrl(uri) {
    uri = this.#convertToAtProtoUri(uri);
    const [, , profile, , rkey] = uri.split('/');
    return this.createPostUrl({ profile, rkey });
  }

  /**
   * Creates a post URL using the provided profile and rkey.
   * @param {{profile: string, rkey: string}} param0 - Contains the profile and rkey.
   * @returns {string} The created URL.
   */
  createPostUrl({ profile, rkey }) {
    profile = profile || this.profile;
    if (profile.startsWith('@')) {
      profile = profile.slice(1);
    }
    return `https://bsky.app/profile/${profile}/post/${rkey}`;
  }

  /**
   * Generates a post ID based on the post URI.
   * @param {{uri: string}} param0 - An object with the post URI.
   * @returns {string} The generated post id.
   */
  #postId({ uri }) {
    uri = this.#convertToAtProtoUri(uri);
    const [, , did, , rkey] = uri.split('/');
    return `${did}-${rkey}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  /**
   * Logs a warning if the post URL does not match with the thread's URI.
   */
  #logAtUri() {
    const threadUri = this.thread.post.uri;
    if (this.post === threadUri) {
      return;
    }

    console.warn(
      `[bluesky-comments] For more stable and future-proof comments, replace the post URL ${this.post} with the resolved AT-proto URI ${threadUri}.`,
      { source: this.post, resolved: threadUri },
    );
  }

  /**
   * Fetches thread data from the Bluesky API.
   * @returns {Promise<void>}
   */
  async #fetchThreadData() {
    const uri = this.#convertToAtProtoUri(this.post);
    const params = new URLSearchParams({ uri });
    const res = await fetch(
      'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?' +
        params.toString(),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      throw new Error('Failed to fetch post thread');
    }

    const { thread } = await res.json();
    this.thread = thread;
    if (
      'post' in thread &&
      'threadgate' in thread.post &&
      thread.post.threadgate
    ) {
      this.hiddenReplies = thread.post.threadgate?.record?.hiddenReplies ?? [];
    }
  }

  /**
   * Determines whether to filter out a comment based on its content and metadata.
   * @param {any} comment - The comment object.
   * @returns {boolean} True if the comment should be filtered; otherwise false.
   */
  shouldFilterComment(comment) {
    if (!comment?.post?.record?.text) return true;

    if (this.hiddenReplies && this.hiddenReplies.includes(comment.post.uri)) {
      return true;
    }

    if ('blocked' in comment && comment.blocked) {
      return true;
    }

    if ('notFound' in comment && comment.notFound) {
      return true;
    }

    // Check muted users
    if (this.filterConfig.muteUsers?.includes(comment.post.author.did)) {
      return true;
    }

    // Check muted patterns
    const text = comment.post.record.text;
    if (
      this.filterConfig.mutePatterns?.some(pattern => {
        try {
          // Check if pattern is a regex string (enclosed in /)
          if (pattern.startsWith('/') && pattern.endsWith('/')) {
            const regexStr = pattern.slice(1, -1); // Remove the slashes
            const regex = new RegExp(regexStr);
            return regex.test(text);
          }
          // Fall back to simple string includes for non-regex patterns
          return text.includes(pattern);
        } catch (err) {
          console.error('Invalid regex pattern:', pattern, err);
          return false;
        }
      })
    ) {
      return true;
    }

    // Check empty/spam replies
    if (this.filterConfig.filterEmptyReplies) {
      if (!text.trim() || text.length < 2 || text === '📌') {
        return true;
      }
    }

    return false;
  }

  /**
   * Recursively counts the number of filtered comments in the given replies.
   * @param {any[]} replies - The reply objects.
   * @returns {number} The count of filtered comments.
   */
  countFilteredComments(replies) {
    let count = 0;
    if (!replies) return count;

    for (const reply of replies) {
      if (this.shouldFilterComment(reply)) {
        count++;
      }
      if (reply.replies) {
        count += this.countFilteredComments(reply.replies);
      }
    }
    return count;
  }

  /**
   * Recursively counts non-filtered comments by depth.
   * @param {any[]} replies - The reply objects.
   * @returns {number} The count of hidden comments by depth.
   */
  countHiddenByDepth(replies) {
    let count = 0;
    for (const reply of replies) {
      if (!this.shouldFilterComment(reply)) {
        count++; // Count this reply
        if (reply.replies?.length) {
          count += this.countHiddenByDepth(reply.replies); // Count nested replies
        }
      }
    }
    return count;
  }

  /**
   * Event handler for "show more replies" button clicks.
   * @param {MouseEvent & { target: HTMLButtonElement }} event - The click event
   * with the target being a ButtonElement.
   */
  showMoreReplies(event) {
    const postId = event.target.getAttribute('data-post-id');
    if (!postId) return;

    // Initialize or increment the visibility count for this post
    const currentCount =
      this.postVisibilityCounts.get(postId) || this.nShowInit;
    const newCount = currentCount + this.nShowMore;
    this.postVisibilityCounts.set(postId, newCount);

    // Re-render the comment with updated visibility
    this.render();
  }

  /**
   * Event handler for "show more depth" button clicks.
   * @param {MouseEvent & { target: HTMLButtonElement }} event - The click event
   * with the target being a ButtonElement.
   */
  showMoreDepth(event) {
    const postId = event.target.getAttribute('data-post-id');
    if (!postId) return;

    if (this.postVisibilityCounts.has(postId)) {
      // Nothing to do, already expanded
      return;
    }

    this.postVisibilityDepths.add(postId);

    // Re-render the comment with updated visibility
    this.render();
  }

  /**
   * Handles click events on content warning buttons.
   * @param {MouseEvent & { target: HTMLButtonElement }} event - The click event
   * with the target being a ButtonElement.
   */
  #handleWarningClick(event) {
    const button = event.target;
    const warningBox = button.closest('.bc-comment__content-warning');
    if (!warningBox) return;
    const contentElement = warningBox.nextElementSibling;

    if (warningBox && contentElement instanceof HTMLElement) {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';

      // Toggle visibility and ARIA states
      contentElement.hidden = isExpanded;
      button.setAttribute('aria-expanded', (!isExpanded).toString());
      button.textContent = isExpanded ? 'Show content' : 'Hide content';
    }
  }

  /**
   * Renders a single comment.
   * @param {any} comment - The comment object.
   * @param {number} [depth=0] - The current nesting depth.
   * @returns {string} The HTML string representing the comment.
   */
  renderComment(comment, depth = 0) {
    if (this.shouldFilterComment(comment)) return '';

    const author = comment.post.author;
    const avatarHtml = author.avatar
      ? `<img src="${author.avatar}" alt="avatar" class="bc-comment__header__avatar"/>`
      : `<div class="bc-comment__header__avatar--placeholder"></div>`;

    const commentId = `comment-${this.#postId(comment.post)}`;

    const commentText = this.#renderRichPostText(comment.post);

    const replies = (comment.replies || []).filter(
      reply => !this.shouldFilterComment(reply),
    );

    const visibleCount =
      this.postVisibilityCounts.get(comment.post.uri) || this.nShowInit;

    const visibleReplies = replies.slice(0, visibleCount);
    const notVisibleReplies = replies.slice(visibleCount);

    const warningHtml = this.#renderWarning(comment.post);
    const embedHtml = this.#renderEmbeds(comment.post);

    const postUrl = this.#convertToHttpUrl(comment.post.uri);
    const postId = this.#postId(comment.post);

    return `
      <article class="bc-comment" id="${commentId}">
        <header class="bc-comment__header">
          ${avatarHtml}
          <div><a href="https://bsky.app/profile/${
            author.did
          }" target="_blank" class="bc-author-link">
            <span>${author.displayName || '@' + author.handle}</span>
          </a></div>
          <div><a href="${postUrl}"
              class="bc-timestamp-link"
              target="_blank">
            ${this.#formatTimestamp(comment.post.record.createdAt)}
          </a></div>
        </header>
        ${warningHtml}
        <div
          class="bc-comment__body"
          id="${postId}"
          ${warningHtml ? 'hidden' : ''}
        >
          <p>${commentText}</p>
          ${embedHtml}
          </div>
        <footer class="bc-comment__stats">${this.#renderStatsBar(comment.post, {
          postUrl,
          showIcons: false,
          showZero: false,
          includeReplyLink: true,
        })}</footer>
        ${this.renderReplies(visibleReplies, depth + 1)}
        ${this.renderShowMoreButton(comment.post.uri, notVisibleReplies.length)}
      </article>`;
  }

  /**
   * Renders rich post text including facets.
   * @param {any} param0 - The post object containing a record.
   * @returns {string} The HTML string for the rendered text.
   */
  #renderRichPostText({ record }) {
    // Use post text directly, unless facets exist
    let commentText = record.text;

    // Handle facets if they exist
    if (record.facets?.length) {
      // Thank you to https://capscollective.com/blog/bluesky-blog-comments/
      commentText = '';
      const textEncoder = new TextEncoder();
      const utf8Decoder = new TextDecoder();
      const utf8Text = new Uint8Array(record.text.length * 3);
      textEncoder.encodeInto(record.text, utf8Text);

      let charIdx = 0;
      for (const facet of record.facets) {
        const feature = facet.features[0];
        let facetLink = '#';
        let cssClass = '';

        // Determine link and CSS class based on facet type
        if (feature.$type === 'app.bsky.richtext.facet#mention') {
          facetLink = `https://bsky.app/profile/${feature.did}`;
          cssClass = 'bc-comment__body__facet--mention';
        } else if (feature.$type === 'app.bsky.richtext.facet#link') {
          facetLink = feature.uri;
          cssClass = 'bc-comment__body__facet--link';
        } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
          facetLink = `https://bsky.app/hashtag/${feature.tag}`;
          cssClass = 'bc-comment__body__facet--tag';
        }

        // Add text before the facet
        if (charIdx < facet.index.byteStart) {
          const preFacetText = utf8Text.slice(charIdx, facet.index.byteStart);
          commentText += utf8Decoder.decode(preFacetText);
        }

        // Add the facet with appropriate link and class
        const facetText = utf8Text.slice(
          facet.index.byteStart,
          facet.index.byteEnd,
        );
        commentText += `<a href="${facetLink}" class="${cssClass}" target="_blank">${utf8Decoder.decode(
          facetText,
        )}</a>`;

        charIdx = facet.index.byteEnd;
      }

      // Add remaining text after last facet
      if (charIdx < utf8Text.length) {
        const postFacetText = utf8Text.slice(charIdx, utf8Text.length);
        commentText += utf8Decoder.decode(postFacetText);
      }
    }

    commentText = commentText.replace(/\n\n/g, '</p><p>');

    return commentText;
  }

  /**
   * Renders post embeds if any exist.
   * @param {any} post - The post object.
   * @returns {string} The HTML string for the embeds.
   */
  #renderEmbeds(post) {
    let ret = '';

    if (!post.embed) {
      return ret;
    }

    if (post.embed.$type === 'app.bsky.embed.external#view') {
      const { uri, title, description } = post.embed.external;
      if (uri.includes('.gif')) {
        const alt = this.#escapeHtml(description.replace(/^Alt: /, ''));
        ret += `<div class="bc-comment__embed__item bc-bc-comment__embed__item--external"><img src="${uri}" title="${title}" alt="${alt}"></div>`;
      }
    } else if (post.embed.$type === 'app.bsky.embed.images#view') {
      const { images } = post.record.embed;
      for (const { image, alt } of images) {
        const hrefThumbnail = this.#getImageLinkFromBlob({
          link: image.ref.$link,
          author: post.author.did,
          asThumbnail: true,
        });
        const hrefFull = this.#getImageLinkFromBlob({
          link: image.ref.$link,
          author: post.author.did,
          asThumbnail: false,
        });
        ret += `<div class="bc-comment__embed__item bc-comment__embed__item--image"><a href="${hrefFull}" target="_blank"><img src="${hrefThumbnail}" alt="${this.#escapeHtml(
          alt,
        )}"></a></div>`;
      }
    }

    if (ret) {
      ret = `<div class="bc-comment__embed">${ret}</div>`;
    }

    return ret;
  }

  /**
   * Generates a link to an image based on the provided blob.
   * @param {{link: string, author: string, asThumbnail: boolean}} param0 - The blob info.
   * @returns {string} The image link.
   */
  #getImageLinkFromBlob({ link, author, asThumbnail }) {
    return `https://cdn.bsky.app/img/${
      asThumbnail ? 'feed_thumbnail' : 'feed_fullsize'
    }/plain/${author}/${link}`;
  }

  /**
   * Renders replies for a comment.
   * @param {any[]} replies - Array of reply objects.
   * @param {number} depth - The current nesting depth.
   * @returns {string} The HTML string representing the replies.
   */
  renderReplies(replies, depth) {
    if (!replies?.length) return '';

    const parentId = replies[0].post.record.reply.parent.uri;

    if (this.postVisibilityDepths.has(parentId)) {
      depth = depth - 1;
    }

    // If we're beyond or at depth limit, show the "show more depth" button
    if (depth >= this.nShowDepth) {
      const hiddenCount = this.countHiddenByDepth(replies);
      if (hiddenCount > 0) {
        return this.renderShowMoreDepthButton(parentId, hiddenCount);
      }
      return '';
    }

    return `
      <div class="bc-comment__replies">
        ${replies
          .filter(reply => !this.shouldFilterComment(reply))
          .map(reply => this.renderComment(reply, depth))
          .join('')}
      </div>
    `;
  }

  /**
   * Renders the "show more replies" button.
   * @param {string} postId - The id of the post.
   * @param {number} remainingCount - Count of replies not visible.
   * @returns {string} The HTML string for the button.
   */
  renderShowMoreButton(postId, remainingCount) {
    if (remainingCount <= 0) return '';
    const nReveal = Math.min(this.nShowMore, remainingCount);
    const txtComment = remainingCount == 1 ? 'comment' : 'comments';

    let txtButton = `Show ${nReveal} more of ${remainingCount} ${txtComment}`;
    if (remainingCount <= nReveal) {
      txtButton = `Show ${remainingCount} more ${txtComment}`;
    }

    return `
      <button class="bc-comment__show-more bc-comment__show-more--replies" data-post-id="${postId}">${txtButton}</button>
    `;
  }

  /**
   * Renders the "show more nested depth" button.
   * @param {string} postId - The post id.
   * @param {number} count - The number of nested replies hidden.
   * @returns {string} The HTML string for the button.
   */
  renderShowMoreDepthButton(postId, count) {
    const txtComment =
      count === 1 ? 'nested reply' : `of ${count} nested replies`;
    const txtOfCount = count === 1 ? '' : `of ${count}`;
    return `
      <button class="bc-comment__show-more bc-comment__show-more--depth" data-post-id="${postId}">
        Show 1 more ${txtComment}
      </button>
    `;
  }

  /**
   * Renders the entire comment thread.
   */
  render() {
    if (this.error) {
      this.innerHTML = `<p class="bc-error">${this.error}</p>`;
      return;
    }

    if (!this.thread) {
      this.innerHTML = '<p class="bc-loading">Loading comments...</p>';
      return;
    }

    // Filter and sort replies
    const filteredReplies = (this.thread.replies || [])
      .filter(reply => !this.shouldFilterComment(reply))
      .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0));

    // Use root post visibility count for top-level replies
    const visibleCount =
      this.postVisibilityCounts.get('root') || this.nShowInit;
    const visibleReplies = filteredReplies.slice(0, visibleCount);
    const remainingCount = filteredReplies.length - visibleCount;
    const filteredCount = this.countFilteredComments(this.thread.replies);

    let headerHtml = '';
    if (this.header !== false) {
      if (['true', ''].includes(this.header)) {
        headerHtml = '<h2 class="bc-header">Comments</h2>';
      } else {
        headerHtml = `<h2 class="bc-header">${this.header}</h2>`;
      }
    }

    const contentHtml = `
      ${headerHtml}
      <div class="bc-stats">${this.#renderStatsBar(this.thread.post, {
        adjustReplies: -1 * filteredCount,
      })}</div>
      <p class="bc-reply-prompt">
        <a href="${this.postUrl}"
          target="_blank"
        >Reply on Bluesky</a> to join the conversation.
      </p>
      <div class="bc-comments">
        ${visibleReplies.map(reply => this.renderComment(reply, 0)).join('')}
      </div>
      ${this.renderShowMoreButton('root', remainingCount)}
    `;

    this.innerHTML = contentHtml;

    // Simplified warning button event listeners
    this.querySelectorAll('.bc-comment__content-warning__button').forEach(
      button => {
        button.addEventListener('click', e => this.#handleWarningClick(e));
      },
    );

    // Add event listeners for reply buttons
    this.querySelectorAll('.bc-comment__show-more--replies').forEach(button => {
      button.addEventListener('click', this.showMoreReplies);
    });

    // Add event listeners for depth buttons
    this.querySelectorAll('.bc-comment__show-more--depth').forEach(button => {
      button.addEventListener('click', this.showMoreDepth);
    });
  }

  /**
   * Retrieves and formats labels for a given post.
   * @param {any} post - The post object.
   * @returns {string[]|null} An array of labels or null.
   */
  getPostLabels(post) {
    const { labels } = post;

    if (!labels?.length) return null;

    const labelDisplay = {
      sexual: 'adult content',
      porn: 'pornographic adult content',
      '!warn': 'content warning',
      '!hide': 'content warning',
    };

    let formattedLabels = labels
      .map(l => l.val)
      .reduce((acc, l) => {
        if (acc.includes(l)) return acc;
        return [...acc, l];
      }, [])
      .reduce((acc, l) => {
        // Filter out negated labels
        // See https://atproto.blue/en/latest/atproto/atproto_client.models.com.atproto.label.defs.html
        if (l.startsWith('!neg.')) {
          const negatedLabel = l.slice(5);
          return acc.filter(label => label !== negatedLabel);
        }
        return [...acc, l];
      }, [])
      .map(l => labelDisplay[l] || l)
      .map(l => l.replaceAll('-', ' '))
      .sort()
      .reduce((acc, l) => {
        if (acc.includes(l)) return acc;
        return [...acc, l];
      }, []);

    return formattedLabels;
  }

  /**
   * Renders the warning element for posts with labels.
   * @param {any} post - The post object.
   * @returns {string} The HTML string for the warning, if any.
   */
  #renderWarning(post) {
    const labels = this.getPostLabels(post);

    if (!labels) {
      return '';
    }

    let formattedLabels = labels.join(', ');
    formattedLabels =
      formattedLabels.charAt(0).toUpperCase() + formattedLabels.slice(1);

    return `
    <div class="bc-comment__content-warning">
      <span class="bc-comment__content-warning__label">${formattedLabels}</span>
      <button
        class="bc-comment__content-warning__button btn btn-sm btn-soft ms-auto"
        aria-expanded="false"
        aria-controls="${this.#postId(post)}"
      >Show content</button>
    </div>`;
  }

  /**
   * Renders the statistics bar for a post.
   * @param {any} post - The post object.
   * @param {{
   *  postUrl?: string,
   *  showIcons?: boolean,
   *  showZero?: boolean,
   *  adjustReplies?: number,
   *  includeReplyLink?: boolean
   * }} options - Options for rendering the stats bar.
   * @returns {string} The HTML string representing the stats bar.
   */
  #renderStatsBar(
    post,
    { postUrl, showIcons, showZero, adjustReplies, includeReplyLink },
  ) {
    postUrl = postUrl || this.postUrl;
    showIcons = typeof showIcons === 'boolean' ? showIcons : true;
    showZero = typeof showZero === 'boolean' ? showZero : true;
    includeReplyLink =
      typeof includeReplyLink === 'boolean' ? includeReplyLink : false;
    adjustReplies = adjustReplies || 0;

    const plurals = {
      like: 'likes',
      reply: 'replies',
      repost: 'reposts',
      quote: 'quotes',
    };

    const bskyPaths = {
      like: '/liked-by',
      reply: '',
      repost: '/reposted-by',
      quote: '/quotes',
    };

    const stats = {};
    Object.keys(plurals).forEach(type => {
      let count = post[`${type}Count`] || 0;
      if (type === 'reply') {
        count = count + adjustReplies;
      }
      stats[type] = {
        count,
        text: count == 1 ? type : plurals[type],
      };
    });

    const statsHtml = Object.keys(plurals).map(type => {
      if (stats[type].count == 0 && !showZero) {
        return '';
      }

      return `<a href="${postUrl}${
        bskyPaths[type]
      }" target="_blank" class="bc-stats__link">
        ${showIcons ? this.statsIcons[type] : ''}
        <span class="bc-no-wrap">${stats[type].count} ${stats[type].text}</span>
      </a>`;
    });

    if (!includeReplyLink) {
      return statsHtml.join('');
    }

    const replyLink = `<a href="${postUrl}" target="_blank" class="bc-stats__link">${this.statsIcons['reply-to']} Reply</a>`;

    return `${statsHtml.join('')}${replyLink}`;
  }

  /**
   * Shows more comments by increasing the visible count.
   */
  showMore() {
    this.currentVisibleCount += this.nShowMore;
    this.render();
  }

  /**
   * Formats an ISO timestamp into a locale string.
   * @param {string} isoString - The ISO date string.
   * @returns {string} The formatted date.
   */
  #formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString(navigator.language || 'en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Escapes HTML characters in a string.
   * @param {string} x - The string to be escaped.
   * @returns {string} The escaped HTML string.
   */
  #escapeHtml(x) {
    return x
      .replace(/"/g, '&quot;')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * SVG icons for the stats bar.
   * @type {Object<string, string>}
   */
  statsIcons = {
    like: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-pink, pink)" class="bc-icon bi bi-heart-fill" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314"/></svg>',
    repost:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-green, green)" class="bc-icon bi bi-recycle" viewBox="0 0 16 16"><path d="M9.302 1.256a1.5 1.5 0 0 0-2.604 0l-1.704 2.98a.5.5 0 0 0 .869.497l1.703-2.981a.5.5 0 0 1 .868 0l2.54 4.444-1.256-.337a.5.5 0 1 0-.26.966l2.415.647a.5.5 0 0 0 .613-.353l.647-2.415a.5.5 0 1 0-.966-.259l-.333 1.242zM2.973 7.773l-1.255.337a.5.5 0 1 1-.26-.966l2.416-.647a.5.5 0 0 1 .612.353l.647 2.415a.5.5 0 0 1-.966.259l-.333-1.242-2.545 4.454a.5.5 0 0 0 .434.748H5a.5.5 0 0 1 0 1H1.723A1.5 1.5 0 0 1 .421 12.24zm10.89 1.463a.5.5 0 1 0-.868.496l1.716 3.004a.5.5 0 0 1-.434.748h-5.57l.647-.646a.5.5 0 1 0-.708-.707l-1.5 1.5a.5.5 0 0 0 0 .707l1.5 1.5a.5.5 0 1 0 .708-.707l-.647-.647h5.57a1.5 1.5 0 0 0 1.302-2.244z"/></svg>',
    reply:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-blue, blue)" class="bc-icon bi bi-chat-dots-fill" viewBox="0 0 16 16"><path d="M16 8c0 3.866-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7M5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0m4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0m3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>',
    quote:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-purple, purple)" class="bc-icon bi bi-quote" viewBox="0 0 16 16"><path d="M12 12a1 1 0 0 0 1-1V8.558a1 1 0 0 0-1-1h-1.388q0-.527.062-1.054.093-.558.31-.992t.559-.683q.34-.279.868-.279V3q-.868 0-1.52.372a3.3 3.3 0 0 0-1.085.992 4.9 4.9 0 0 0-.62 1.458A7.7 7.7 0 0 0 9 7.558V11a1 1 0 0 0 1 1zm-6 0a1 1 0 0 0 1-1V8.558a1 1 0 0 0-1-1H4.612q0-.527.062-1.054.094-.558.31-.992.217-.434.559-.683.34-.279.868-.279V3q-.868 0-1.52.372a3.3 3.3 0 0 0-1.085.992 4.9 4.9 0 0 0-.62 1.458A7.7 7.7 0 0 0 3 7.558V11a1 1 0 0 0 1 1z"/></svg>',
    'reply-to':
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bc-icon bi bi-reply-fill" viewBox="0 0 16 16"><path d="M5.921 11.9 1.353 8.62a.72.72 0 0 1 0-1.238L5.921 4.1A.716.716 0 0 1 7 4.719V6c1.5 0 6 0 7 8-2.5-4.5-7-4-7-4v1.281c0 .56-.606.898-1.079.62z"/></svg>',
  };
}

customElements.define('bluesky-comments', BlueskyComments);
