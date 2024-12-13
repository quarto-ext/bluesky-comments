class BlueskyComments extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
    this.post = null;
    this.thread = null;
    this.error = null;
    this.filteredCount = 0;  // Track number of filtered comments
    this.config = {
      mutePatterns: [],
      muteUsers: [],
      filterEmptyReplies: true,
      visibleComments: 3,
      visibleSubComments: 3
    };
    this.currentVisibleCount = null;
    this.replyVisibilityCounts = new Map();
    this.acknowledgedWarnings = new Set();

    // Define SVG icons
    this.statsIcons = {
      likes: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-pink, pink)" class="bi bi-heart-fill" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314"/></svg>',
      reposts: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-green, green)" class="bi bi-recycle" viewBox="0 0 16 16"><path d="M9.302 1.256a1.5 1.5 0 0 0-2.604 0l-1.704 2.98a.5.5 0 0 0 .869.497l1.703-2.981a.5.5 0 0 1 .868 0l2.54 4.444-1.256-.337a.5.5 0 1 0-.26.966l2.415.647a.5.5 0 0 0 .613-.353l.647-2.415a.5.5 0 1 0-.966-.259l-.333 1.242zM2.973 7.773l-1.255.337a.5.5 0 1 1-.26-.966l2.416-.647a.5.5 0 0 1 .612.353l.647 2.415a.5.5 0 0 1-.966.259l-.333-1.242-2.545 4.454a.5.5 0 0 0 .434.748H5a.5.5 0 0 1 0 1H1.723A1.5 1.5 0 0 1 .421 12.24zm10.89 1.463a.5.5 0 1 0-.868.496l1.716 3.004a.5.5 0 0 1-.434.748h-5.57l.647-.646a.5.5 0 1 0-.708-.707l-1.5 1.5a.5.5 0 0 0 0 .707l1.5 1.5a.5.5 0 1 0 .708-.707l-.647-.647h5.57a1.5 1.5 0 0 0 1.302-2.244z"/></svg>',
      quotes: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--bs-blue, blue)" class="bi bi-chat-dots-fill" viewBox="0 0 16 16"><path d="M16 8c0 3.866-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7M5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0m4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0m3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>'
    };

    // Bind methods
    this.showMore = this.showMore.bind(this);
    this.showMoreReplies = this.showMoreReplies.bind(this);
  }

  static get observedAttributes() {
    return ['post'];
  }

  async connectedCallback() {
    const configStr = this.getAttribute('config');

    // Parse configuration
    if (configStr) {
      try {
        const userConfig = JSON.parse(configStr);
        this.config = { ...this.config, ...userConfig };
      } catch (err) {
        console.error('Error parsing config:', err);
      }
    }

    this.#setPostUri(this.getAttribute('post'));

    // Initialize visible count from config
    this.currentVisibleCount = this.config.visibleComments;
    if (!this._initialized) {
      this._initialized = true
      this.#loadThread();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._initialized) {
      // connectedCallback handles first load but is async
      return
    }
    if (oldValue === newValue) return

    if (name === 'post') {
      this.#setPostUri(newValue);
      this.#loadThread();
    }
  }

  #setPostUri(newValue) {
    if (newValue && !/^(https?|at):\/\//.test(newValue)) {
      if (this.config.profile) {
        if (this.config.profile.startsWith("did:")) {
          newValue = `at://${this.config.profile}/app.bsky.feed.post/${newValue}`
        } else {
          newValue = `https://bsky.app/profile/${this.config.profile.replace("@", "")}/post/${newValue}`
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
      console.error("[bluesky-comments] Error loading comments", error);
      this.error = 'Error loading comments';
      this.render();
    }
  }

  #convertUri (uri) {
    if (uri.startsWith('at://')) return uri

    const match = uri.match(/profile\/([\w.]+)\/post\/([\w]+)/)
    if (match) {
      const [, did, postId] = match
      return `at://${did}/app.bsky.feed.post/${postId}`
    }

    this.error = 'Invalid Bluesky post URL format'
    return null
  }

  #logAtUri () {
    const threadUri = this.thread.post.uri
    if (this.post === threadUri) {
      return
    }

    console.warn(
      `[bluesky-comments] For more stable and future-proof comments, replace the post URL ${this.post} with the resolved AT-proto URI ${threadUri}.`,
      { source: this.post, resolved: threadUri }
    )
  }

  async #fetchThreadData() {
    const uri = this.#convertUri(this.post);
    const params = new URLSearchParams({ uri });
    const res = await fetch(
      "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?" + params.toString(),
      {
        method: 'GET',
        headers: {
          "Accept": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      throw new Error("Failed to fetch post thread");
    }

    const data = await res.json();
    this.thread = data.thread;
  }

  shouldFilterComment(comment) {
    if (!comment?.post?.record?.text) return true;

    // Check muted users
    if (this.config.muteUsers?.includes(comment.post.author.did)) {
      return true;
    }

    // Check muted patterns
    const text = comment.post.record.text;
    if (this.config.mutePatterns?.some(pattern => {
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
    })) {
      return true;
    }

    // Check empty/spam replies
    if (this.config.filterEmptyReplies &&
        (!text.trim() || text.length < 2)) {
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
    const commentId = button.getAttribute('data-comment-id');
    if (!commentId) return;

    // Initialize or increment the visibility count for this comment
    const currentCount = this.replyVisibilityCounts.get(commentId) || this.config.visibleSubComments;
    const newCount = currentCount + this.config.visibleSubComments;
    this.replyVisibilityCounts.set(commentId, newCount);

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
      if (warningElement && warningElement.classList.contains('content-warning')) {
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
    const commentId = `${author.did}-${comment.post.record.text.slice(0, 20)}`.replace(/[^a-zA-Z0-9-]/g, '-');

    const replies = (comment.replies || []).filter(reply => !this.shouldFilterComment(reply));
    const visibleCount = this.replyVisibilityCounts.get(commentId) || this.config.visibleSubComments;

    const visibleReplies = replies.slice(0, visibleCount);
    const hiddenReplies = replies.slice(visibleCount);

    const labels = comment.post.labels?.map(l => ({
      value: l.val.charAt(0).toUpperCase() + l.val.slice(1)
    })) || [];

    const warningType = labels.map(l => l.value).sort().join('-');
    const hasWarning = labels.length > 0 && !this.acknowledgedWarnings.has(warningType);
    const warningId = hasWarning ? `warning-${commentId}` : '';

    const warningHtml = hasWarning ? `
      <div class="content-warning">
        <div class="warning-content">
          ${labels.map(label => `
            <div class="label-warning">
              <strong>${label.value}</strong>
              <p>Warning: This content may contain sensitive material</p>
              <p class="label-attribution">This label was applied by the Bluesky community.</p>
            </div>
          `).join('')}
          <p class="warning-prompt">Do you wish to see these comments?</p>
          <hr class="warning-divider"/>
          <button class="warning-button"
                  data-warning-type="${warningType}"
                  data-content-id="${warningId}">
            Show Comments
          </button>
        </div>
      </div>
    ` : '';

    const postId = comment.post.uri.split("/").pop()

    return `
      <div class="comment" id="comment-${commentId}">
        ${warningHtml}
        <div id="${warningId}" style="display: ${hasWarning ? 'none' : 'block'}">
          <div class="comment-header">
            <a href="https://bsky.app/profile/${author.did}" target="_blank" class="author-link">
              ${avatarHtml}
              <span>${author.displayName || author.handle}</span>
              <span class="handle">@${author.handle}</span>
            </a>
            <a href="https://bsky.app/profile/${author.did}/post/${postId}"
               class="timestamp-link"
               target="_blank">
              ${this.#formatTimestamp(comment.post.record.createdAt)}
            </a>
          </div>
          <div class="comment-body">
            <p>${comment.post.record.text}</p>
            <div class="comment-actions">
              <span class="action-item">${this.statsIcons.likes} ${comment.post.likeCount || 0}</span>
              <span class="action-item">${this.statsIcons.reposts} ${comment.post.repostCount || 0}</span>
              <span class="action-item">${this.statsIcons.quotes} ${comment.post.replyCount || 0}</span>
            </div>
          </div>
          ${this.renderReplies(visibleReplies, depth + 1)}
          ${hiddenReplies.length > 0 ?
            `<button class="show-more-replies" data-comment-id="${commentId}">
              Show ${hiddenReplies.length} more replies
              </button>` : ''}
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

  render() {
    if (this.error) {
      this.innerHTML = `<p class="error">${this.error}</p>`;
      return;
    }

    if (!this.thread) {
      this.innerHTML = '<p class="loading">Loading comments...</p>';
      return;
    }

    const [, , did, , rkey] = this.getAttribute('post').split('/');
    const postUrl = `https://bsky.app/profile/${did}/post/${rkey}`;

    // Filter and sort replies
    const labels = this.thread.post.labels?.map(l => ({
      value: l.val.charAt(0).toUpperCase() + l.val.slice(1)
    })) || [];

    const warningType = labels.map(l => l.value).sort().join('-');
    const hasWarning = labels.length > 0 && !this.acknowledgedWarnings.has(warningType);
    const warningId = hasWarning ? `warning-${Math.random().toString(36).substr(2, 9)}` : '';

    const filteredReplies = (this.thread.replies || [])
      .filter(reply => !this.shouldFilterComment(reply))
      .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0));

    // Get visible replies based on currentVisibleCount
    const visibleReplies = filteredReplies.slice(0, this.currentVisibleCount);
    const remainingCount = filteredReplies.length - this.currentVisibleCount;
    const filteredCount = this.countFilteredComments(this.thread.replies);

    const warningHtml = hasWarning ? `
      <div class="content-warning">
        <div class="warning-content">
          ${labels.map(label => `
            <div class="label-warning">
              <strong>${label.value}</strong>
              <p>Warning: This content may contain sensitive material</p>
              <p class="label-attribution">This label was applied by the Bluesky community.</p>
            </div>
          `).join('')}
          <p class="warning-prompt">Do you wish to see these comments?</p>
          <hr class="warning-divider"/>
          <button class="warning-button"
                  data-warning-type="${warningType}"
                  data-content-id="${warningId}">
            Show Comments
          </button>
        </div>
      </div>
    ` : '';

    const contentHtml = `
      <h2>Comments</h2>
      <div class="stats">
        <a href="${postUrl}/likes" target="_blank" class="stat-link">
          <span class="action-item">${this.statsIcons.likes} ${this.thread.post.likeCount || 0}</span>
        </a>
        <a href="${postUrl}/repost" target="_blank" class="stat-link">
          <span class="action-item">${this.statsIcons.reposts} ${this.thread.post.repostCount || 0}</span>
        </a>
        <a href="${postUrl}/quotes" target="_blank" class="stat-link">
          <span class="action-item">${this.statsIcons.quotes} ${this.thread.post.replyCount || 0}</span>
        </a>
      </div>
      ${filteredCount > 0 ?
        `<p class="filtered-notice">
          ${filteredCount} ${filteredCount === 1 ? 'comment has' : 'comments have'} been filtered based on moderation settings.
          </p>` : ''}
      <p class="reply-prompt">
        <a href="${postUrl}" target="_blank">Reply on Bluesky</a> to join the conversation.
      </p>
      <hr/>
      <div class="comments-list">
        ${visibleReplies.map(reply => this.renderComment(reply, 0)).join('')}
      </div>
      ${remainingCount > 0 ?
        `<button class="show-more">
          Show ${remainingCount} more comments
          </button>` : ''}
    `;

    this.innerHTML = `
      <div class="bluesky-comments-container">
        ${warningHtml}
        <div id="${warningId}" style="display: ${hasWarning ? 'none' : 'block'}">
          ${contentHtml}
        </div>
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
      const showMoreButton = this.querySelector('.show-more');
      if (showMoreButton) {
        showMoreButton.addEventListener('click', this.showMore);
      }
    }

    // Add event listeners for reply buttons
    this.querySelectorAll('.show-more-replies').forEach(button => {
      button.addEventListener('click', this.showMoreReplies);
    });
  }

  showMore() {
    this.currentVisibleCount += this.config.visibleComments;
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
      hour12: true
    });
  }
}

customElements.define('bluesky-comments', BlueskyComments);
