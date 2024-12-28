class BlueskyComments extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
    this.post = null;
    this.thread = null;
    this.error = null;
    this.filteredCount = 0; // Track number of filtered comments
    this.filterConfig = {
      mutePatterns: [],
      muteUsers: [],
      filterEmptyReplies: true,
    };
    this.profile = null;
    this.nShowInit = 3;
    this.nShowMore = 2;
    this.postVisibilityCounts = new Map();
    this.acknowledgedWarnings = new Set();

    // Bind methods
    this.showMoreReplies = this.showMoreReplies.bind(this);
  }

  get postUrl() {
    const [, , did, , rkey] = this.getAttribute('post').split('/');
    return `https://bsky.app/profile/${did}/post/${rkey}`;
  }

  static get observedAttributes() {
    return ['post'];
  }

  async connectedCallback() {
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
    ].forEach(({ attr, prop }) => {
      let value = this.getAttribute(attr);
      if (!value) return;
      if (typeof value !== 'number') {
        value = parseInt(value);
        if (!isNaN(value)) {
          this[prop] = value;
        }
      }
    });

    this.profile = this.getAttribute('profile');

    this.#setPostUri(this.getAttribute('post'));

    // Initialize root post visibility count
    this.postVisibilityCounts.set('root', this.nShowInit);

    if (!this._initialized) {
      this._initialized = true;
      this.#loadThread();
    }
  }

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
  }

  #setPostUri(newValue) {
    if (newValue && !/^(https?|at):\/\//.test(newValue)) {
      if (this.profile) {
        if (this.profile.startsWith('did:')) {
          newValue = `at://${this.profile}/app.bsky.feed.post/${newValue}`;
        } else {
          newValue = `https://bsky.app/profile/${this.profile.replace(
            '@',
            '',
          )}/post/${newValue}`;
        }
      }
    }
    this.post = newValue;
  }

  async #loadThread() {
    if (!this.post) {
      this.error = 'Post link (or at:// URI) is required';
      this.render();
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

  #convertUri(uri) {
    if (uri.startsWith('at://')) return uri;

    const match = uri.match(/profile\/([\w.]+)\/post\/([\w]+)/);
    if (match) {
      const [, did, postId] = match;
      return `at://${did}/app.bsky.feed.post/${postId}`;
    }

    this.error = 'Invalid Bluesky post URL format';
    return null;
  }

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

  async #fetchThreadData() {
    const uri = this.#convertUri(this.post);
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

    const data = await res.json();
    this.thread = data.thread;
  }

  shouldFilterComment(comment) {
    if (!comment?.post?.record?.text) return true;

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
    if (
      this.filterConfig.filterEmptyReplies &&
      (!text.trim() || text.length < 2)
    ) {
      return true;
    }

    return false;
  }

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

  showMoreReplies(event) {
    const button = event.target;
    const postId = button.getAttribute('data-post-id');
    if (!postId) return;

    // Initialize or increment the visibility count for this post
    const currentCount =
      this.postVisibilityCounts.get(postId) || this.nShowInit;
    const newCount = currentCount + this.nShowMore;
    this.postVisibilityCounts.set(postId, newCount);

    // Re-render the comment with updated visibility
    this.render();
  }

  // Handle warning button clicks
  handleWarningClick(warningType, contentId) {
    this.acknowledgedWarnings.add(warningType);
    const contentElement = document.getElementById(contentId);
    if (contentElement) {
      contentElement.style.display = 'block';
      const warningElement = contentElement.previousElementSibling;
      if (
        warningElement &&
        warningElement.classList.contains('content-warning')
      ) {
        warningElement.style.display = 'none';
      }
    }
    // Re-render to update other warnings of the same type
    this.render();
  }

  renderComment(comment, depth = 0) {
    if (this.shouldFilterComment(comment)) return '';

    const author = comment.post.author;
    const avatarHtml = author.avatar
      ? `<img src="${author.avatar}" alt="avatar" class="avatar"/>`
      : `<div class="avatar-placeholder"></div>`;

    // Generate a stable comment ID based on author and text
    const commentId = `${author.did}-${comment.post.record.text.slice(
      0,
      20,
    )}`.replace(/[^a-zA-Z0-9-]/g, '-');

    // Generate post ID for visibility tracking
    const postId = comment.post.uri;

    const replies = (comment.replies || []).filter(
      reply => !this.shouldFilterComment(reply),
    );
    const visibleCount =
      this.postVisibilityCounts.get(postId) || this.nShowInit;

    const visibleReplies = replies.slice(0, visibleCount);
    const hiddenReplies = replies.slice(visibleCount);

    const labels =
      comment.post.labels?.map(l => ({
        value: l.val.charAt(0).toUpperCase() + l.val.slice(1),
      })) || [];

    const warningType = labels
      .map(l => l.value)
      .sort()
      .join('-');
    const hasWarning =
      labels.length > 0 && !this.acknowledgedWarnings.has(warningType);
    const warningId = hasWarning ? `warning-${commentId}` : '';

    const postUrl = `https://bsky.app/profile/${author.did}/post/${postId}`;

    const warningHtml = hasWarning
      ? `
      <div class="content-warning">
        <div class="warning-content">
          ${labels
            .map(
              label => `
            <div class="label-warning">
              <strong>${label.value}</strong>
              <p>Warning: This content may contain sensitive material</p>
              <p class="label-attribution">This label was applied by the Bluesky community.</p>
            </div>
          `,
            )
            .join('')}
          <p class="warning-prompt">Do you wish to see these comments?</p>
          <hr class="warning-divider"/>
          <button class="warning-button"
                  data-warning-type="${warningType}"
                  data-content-id="${warningId}">
            Show Comments
          </button>
        </div>
      </div>
    `
      : '';

    return `
      <div class="comment" id="comment-${commentId}">
        ${warningHtml}
        <div id="${warningId}" style="display: ${
      hasWarning ? 'none' : 'block'
    }">
          <div class="comment-header">
            ${avatarHtml}
            <a href="https://bsky.app/profile/${
              author.did
            }" target="_blank" class="author-link">
              <span>${author.displayName || '@' + author.handle}</span>
            </a>
            <a href="${postUrl}"
               class="timestamp-link"
               target="_blank">
              ${this.#formatTimestamp(comment.post.record.createdAt)}
            </a>
          </div>
          <div class="comment-body">
            <p>${comment.post.record.text}</p>
            <div class="comment-stats">${this.#postStatsBar(comment.post, {
              postUrl,
              showIcons: false,
              showZero: false,
            })}</div>
          </div>
          ${this.renderReplies(visibleReplies, depth + 1)}
          ${this.renderShowMoreButton(postId, hiddenReplies.length)}
        </div>
      </div>
    `;
  }

  renderReplies(replies, depth) {
    if (!replies?.length) return '';

    return `
      <div class="replies">
        ${replies
          .filter(reply => !this.shouldFilterComment(reply))
          .map(reply => this.renderComment(reply, depth))
          .join('')}
      </div>
    `;
  }

  renderShowMoreButton(postId, remainingCount) {
    if (remainingCount <= 0) return '';
    const nReveal = Math.min(this.nShowMore, remainingCount);
    const txtComment = remainingCount == 1 ? 'comment' : 'comments';

    let txtButton = `Show ${nReveal} more of ${remainingCount} ${txtComment}`;
    if (remainingCount <= nReveal) {
      txtButton = `Show ${remainingCount} more ${txtComment}`;
    }

    return `
      <button class="show-more-replies" data-post-id="${postId}">${txtButton}</button>
    `;
  }

  render() {
    if (this.error) {
      this.innerHTML = `<p class="error">${this.error}</p>`;
      return;
    }

    if (!this.thread) {
      this.innerHTML = '<p class="loading">Loading comments...</p>';
      return;
    }

    const postUrl = this.postUrl;

    // Filter and sort replies
    const labels =
      this.thread.post.labels?.map(l => ({
        value: l.val.charAt(0).toUpperCase() + l.val.slice(1),
      })) || [];

    const warningType = labels
      .map(l => l.value)
      .sort()
      .join('-');
    const hasWarning =
      labels.length > 0 && !this.acknowledgedWarnings.has(warningType);
    const warningId = hasWarning
      ? `warning-${Math.random().toString(36).substr(2, 9)}`
      : '';

    const filteredReplies = (this.thread.replies || [])
      .filter(reply => !this.shouldFilterComment(reply))
      .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0));

    // Use root post visibility count for top-level replies
    const visibleCount =
      this.postVisibilityCounts.get('root') || this.nShowInit;
    const visibleReplies = filteredReplies.slice(0, visibleCount);
    const remainingCount = filteredReplies.length - visibleCount;
    const filteredCount = this.countFilteredComments(this.thread.replies);

    const warningHtml = hasWarning
      ? `
      <div class="content-warning">
        <div class="warning-content">
          ${labels
            .map(
              label => `
            <div class="label-warning">
              <strong>${label.value}</strong>
              <p>Warning: This content may contain sensitive material</p>
              <p class="label-attribution">This label was applied by the Bluesky community.</p>
            </div>
          `,
            )
            .join('')}
          <p class="warning-prompt">Do you wish to see these comments?</p>
          <hr class="warning-divider"/>
          <button class="warning-button"
                  data-warning-type="${warningType}"
                  data-content-id="${warningId}">
            Show Comments
          </button>
        </div>
      </div>
    `
      : '';

    const contentHtml = `
      <h2>Comments</h2>
      <div class="stats">${this.#postStatsBar(this.thread.post)}</div>
      ${
        filteredCount > 0
          ? `<p class="filtered-notice">
          ${filteredCount} ${
              filteredCount === 1 ? 'comment has' : 'comments have'
            } been filtered based on moderation settings.
          </p>`
          : ''
      }
      <p class="reply-prompt">
        <a href="${postUrl}" target="_blank">Reply on Bluesky</a> to join the conversation.
      </p>
      <div class="comments-list">
        ${visibleReplies.map(reply => this.renderComment(reply, 0)).join('')}
      </div>
      ${this.renderShowMoreButton('root', remainingCount)}
    `;

    this.innerHTML = `${warningHtml}
      <div id="${warningId}" style="display: ${hasWarning ? 'none' : 'block'}">
        ${contentHtml}
      </div>
    `;

    // Add event listeners after rendering
    this.querySelectorAll('.warning-button').forEach(button => {
      button.addEventListener('click', () => {
        const warningType = button.getAttribute('data-warning-type');
        const contentId = button.getAttribute('data-content-id');
        if (warningType && contentId) {
          this.handleWarningClick(warningType, contentId);
        }
      });
    });

    // Add other event listeners
    if (remainingCount > 0) {
      const showMoreButton = this.querySelector('.show-more-replies');
      if (showMoreButton) {
        showMoreButton.addEventListener('click', this.showMoreReplies);
      }
    }

    // Add event listeners for reply buttons
    this.querySelectorAll('.show-more-replies').forEach(button => {
      button.addEventListener('click', this.showMoreReplies);
    });
  }

  #postStatsBar(
    post,
    { postUrl, showIcons, showZero } = { showIcons: true, showZero: true },
  ) {
    postUrl = postUrl || this.postUrl;

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
      const count = post[`${type}Count`] || 0;
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
      }" target="_blank" class="stat-link">
        <span class="action-item">
          ${showIcons ? this.statsIcons[type] : ''}
          <span class="action-text">${stats[type].count} ${
        stats[type].text
      }</span>
        </span>
      </a>`;
    });

    return statsHtml.join('\n');
  }

  showMore() {
    this.currentVisibleCount += this.nShowMore;
    this.render();
  }

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

  // Define SVG icons
  statsIcons = {
    like: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-pink, pink)" class="bi bi-heart-fill" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314"/></svg>',
    repost:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-green, green)" class="bi bi-recycle" viewBox="0 0 16 16"><path d="M9.302 1.256a1.5 1.5 0 0 0-2.604 0l-1.704 2.98a.5.5 0 0 0 .869.497l1.703-2.981a.5.5 0 0 1 .868 0l2.54 4.444-1.256-.337a.5.5 0 1 0-.26.966l2.415.647a.5.5 0 0 0 .613-.353l.647-2.415a.5.5 0 1 0-.966-.259l-.333 1.242zM2.973 7.773l-1.255.337a.5.5 0 1 1-.26-.966l2.416-.647a.5.5 0 0 1 .612.353l.647 2.415a.5.5 0 0 1-.966.259l-.333-1.242-2.545 4.454a.5.5 0 0 0 .434.748H5a.5.5 0 0 1 0 1H1.723A1.5 1.5 0 0 1 .421 12.24zm10.89 1.463a.5.5 0 1 0-.868.496l1.716 3.004a.5.5 0 0 1-.434.748h-5.57l.647-.646a.5.5 0 1 0-.708-.707l-1.5 1.5a.5.5 0 0 0 0 .707l1.5 1.5a.5.5 0 1 0 .708-.707l-.647-.647h5.57a1.5 1.5 0 0 0 1.302-2.244z"/></svg>',
    reply:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-blue, blue)" class="bi bi-chat-dots-fill" viewBox="0 0 16 16"><path d="M16 8c0 3.866-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7M5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0m4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0m3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>',
    quote:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-purple, purple)" class="bi bi-quote" viewBox="0 0 16 16"><path d="M12 12a1 1 0 0 0 1-1V8.558a1 1 0 0 0-1-1h-1.388q0-.527.062-1.054.093-.558.31-.992t.559-.683q.34-.279.868-.279V3q-.868 0-1.52.372a3.3 3.3 0 0 0-1.085.992 4.9 4.9 0 0 0-.62 1.458A7.7 7.7 0 0 0 9 7.558V11a1 1 0 0 0 1 1zm-6 0a1 1 0 0 0 1-1V8.558a1 1 0 0 0-1-1H4.612q0-.527.062-1.054.094-.558.31-.992.217-.434.559-.683.34-.279.868-.279V3q-.868 0-1.52.372a3.3 3.3 0 0 0-1.085.992 4.9 4.9 0 0 0-.62 1.458A7.7 7.7 0 0 0 3 7.558V11a1 1 0 0 0 1 1z"/></svg>',
  };
}

customElements.define('bluesky-comments', BlueskyComments);
