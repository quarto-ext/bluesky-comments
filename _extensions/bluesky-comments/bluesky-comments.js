document.addEventListener('DOMContentLoaded', function() {
    class BlueskyComments extends HTMLElement {
      constructor() {
        super();
        this.thread = null;
        this.error = null;
        this.visibleCount = 3;
      }
  
      async connectedCallback() {
        const uri = this.getAttribute('data-uri');
        if (!uri) return;
  
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
  
      renderComment(comment) {
        if (!comment?.post?.record?.text) return '';
        
        const author = comment.post.author;
        const avatarHtml = author.avatar 
          ? `<img src="${author.avatar}" alt="avatar" class="avatar"/>`
          : `<div class="avatar-placeholder"></div>`;
  
        return `
          <div class="comment">
            <div class="comment-header">
              <a href="https://bsky.app/profile/${author.did}" target="_blank" class="author-link">
                ${avatarHtml}
                <span>${author.displayName || author.handle}</span>
                <span class="handle">@${author.handle}</span>
              </a>
            </div>
            <div class="comment-body">
              <p>${comment.post.record.text}</p>
              <div class="comment-actions">
                <span>♡ ${comment.post.likeCount || 0}</span>
                <span>↻ ${comment.post.repostCount || 0}</span>
                <span>💬 ${comment.post.replyCount || 0}</span>
              </div>
            </div>
            ${this.renderReplies(comment.replies)}
          </div>
        `;
      }
  
      renderReplies(replies) {
        if (!replies?.length) return '';
        
        return `
          <div class="replies">
            ${replies.map(reply => this.renderComment(reply)).join('')}
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
  
        this.innerHTML = `
          <div class="bluesky-comments-container">
            <div class="stats">
              <a href="${postUrl}" target="_blank">
                <span>♡ ${this.thread.post.likeCount || 0} likes</span>
                <span>↻ ${this.thread.post.repostCount || 0} reposts</span>
                <span>💬 ${this.thread.post.replyCount || 0} replies</span>
              </a>
            </div>
            <h2>Comments</h2>
            <p class="reply-prompt">
              Reply on Bluesky <a href="${postUrl}" target="_blank">here</a> to join the conversation.
            </p>
            <hr/>
            <div class="comments-list">
              ${(this.thread.replies || [])
                .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0))
                .slice(0, this.visibleCount)
                .map(reply => this.renderComment(reply))
                .join('')}
            </div>
            ${this.thread.replies?.length > this.visibleCount ? 
              `<button class="show-more" onclick="this.closest('.bluesky-comments').showMore()">
                Show more comments
               </button>` : ''}
          </div>
        `;
      }
  
      showMore() {
        this.visibleCount += 5;
        this.render();
      }
    }
  
    customElements.define('bluesky-comments', BlueskyComments);
  
    // Convert all div.bluesky-comments to custom elements
    document.querySelectorAll('div.bluesky-comments').forEach(div => {
      const uri = div.getAttribute('data-uri');
      const component = document.createElement('bluesky-comments');
      component.setAttribute('data-uri', uri);
      div.parentNode.replaceChild(component, div);
    });
  });