document.addEventListener('DOMContentLoaded', function() {
  class BlueskyComments extends HTMLElement {
    constructor() {
      super();
      this.thread = null;
      this.error = null;
      this.config = {
        mutePatterns: [],
        muteUsers: [],
        filterEmptyReplies: true,
        visibleComments: 3,
        visibleSubComments: 3
      };
      this.currentVisibleCount = null;
      this.replyVisibilityCounts = new Map();
      
      // Bind methods
      this.showMore = this.showMore.bind(this);
      this.showMoreReplies = this.showMoreReplies.bind(this);
    }

    async connectedCallback() {
      const uri = this.getAttribute('data-uri');
      const configStr = this.getAttribute('data-config');
      
      if (!uri) return;

      // Parse configuration
      if (configStr) {
        try {
          const userConfig = JSON.parse(configStr);
          this.config = { ...this.config, ...userConfig };
        } catch (err) {
          console.error('Error parsing config:', err);
        }
      }

      // Initialize visible count from config
      this.currentVisibleCount = this.config.visibleComments;

      try {
        await this.fetchThreadData(uri);
        this.render();
      } catch (err) {
        this.error = 'Error loading comments';
        this.render();
      }
    }

    async fetchThreadData(uri) {
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

    renderContentWarning(labels) {
      if (!labels?.length) return '';
      
      const warningId = `warning-${Math.random().toString(36).substr(2, 9)}`;
      return `
        <div class="content-warning">
          <button onclick="document.getElementById('${warningId}').style.display='block'; this.style.display='none'">
            Click to see content (${labels.join(', ')})
          </button>
          <div id="${warningId}" style="display: none">
      `;
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

      const labels = comment.post.labels?.map(l => l.val) || [];
      const warningStart = this.renderContentWarning(labels);
      const warningEnd = labels.length ? '</div></div>' : '';

      return `
        <div class="comment" id="comment-${commentId}">
          <div class="comment-header">
            <a href="https://bsky.app/profile/${author.did}" target="_blank" class="author-link">
              ${avatarHtml}
              <span>${author.displayName || author.handle}</span>
              <span class="handle">@${author.handle}</span>
            </a>
          </div>
          <div class="comment-body">
            ${warningStart}
            <p>${comment.post.record.text}</p>
            ${warningEnd}
            <div class="comment-actions">
              <span>♡ ${comment.post.likeCount || 0}</span>
              <span>↻ ${comment.post.repostCount || 0}</span>
              <span>💬 ${comment.post.replyCount || 0}</span>
            </div>
          </div>
          ${this.renderReplies(visibleReplies, depth + 1)}
          ${hiddenReplies.length > 0 ? 
            `<button class="show-more-replies" data-comment-id="${commentId}">
              Show ${hiddenReplies.length} more replies
             </button>` : ''}
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

      const [, , did, , rkey] = this.getAttribute('data-uri').split('/');
      const postUrl = `https://bsky.app/profile/${did}/post/${rkey}`;

      // Check for labels on the main post
      const labels = this.thread.post.labels?.map(l => l.val) || [];
      const warningStart = this.renderContentWarning(labels);
      const warningEnd = labels.length ? '</div></div>' : '';

      // Filter and sort replies
      const filteredReplies = (this.thread.replies || [])
        .filter(reply => !this.shouldFilterComment(reply))
        .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0));

      // Get visible replies based on currentVisibleCount
      const visibleReplies = filteredReplies.slice(0, this.currentVisibleCount);
      const remainingCount = filteredReplies.length - this.currentVisibleCount;

      this.innerHTML = `
        <div class="bluesky-comments-container">
          ${warningStart}
          <div class="stats">
            <a href="${postUrl}" target="_blank">
              <span>♡ ${this.thread.post.likeCount || 0} likes</span>
              <span>↻ ${this.thread.post.repostCount || 0} reposts</span>
              <span>💬 ${this.thread.post.replyCount || 0} replies</span>
            </a>
          </div>
          ${warningEnd}
          <h2>Comments</h2>
          <p class="reply-prompt">
            Reply on Bluesky <a href="${postUrl}" target="_blank">here</a> to join the conversation.
          </p>
          <hr/>
          <div class="comments-list">
            ${visibleReplies.map(reply => this.renderComment(reply, 0)).join('')}
          </div>
          ${remainingCount > 0 ? 
            `<button class="show-more">
              Show ${filteredReplies.length} comments
             </button>` : ''}
        </div>
      `;

      // Add event listeners after rendering
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
  }

  customElements.define('bluesky-comments', BlueskyComments);

  // Convert all div.bluesky-comments to custom elements
  document.querySelectorAll('div.bluesky-comments').forEach(div => {
    const uri = div.getAttribute('data-uri');
    const config = div.getAttribute('data-config');
    const component = document.createElement('bluesky-comments');
    component.setAttribute('data-uri', uri);
    if (config) component.setAttribute('data-config', config);
    div.parentNode.replaceChild(component, div);
  });
});