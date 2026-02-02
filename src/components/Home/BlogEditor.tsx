import React, { useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';
import './BlogEditor.css';

interface BlogEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onPostComplete: () => void;
}

export const BlogEditor: React.FC<BlogEditorProps> = ({ isOpen, onClose, onPostComplete }) => {
  const { ndk, user } = useNostr();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  if (!isOpen) return null;

  const handlePublish = async () => {
    if (!title || !content || !ndk || !user) {
      alert('Please fill in both title and content.');
      return;
    }
    setIsPublishing(true);

    try {
      const event = new NDKEvent(ndk);
      event.kind = 30023;
      event.content = content;

      const now = Math.floor(Date.now() / 1000);
      const dTag = `blog-${user.pubkey.slice(0, 8)}-${now}`;

      event.tags = [
        ['title', title],
        ['summary', summary],
        ['published_at', now.toString()],
        ['d', dTag],
      ];

      if (image) {
        event.tags.push(['image', image]);
      }

      console.log('Publishing Kind 30023 event...');
      await event.publish();

      alert('Blog post published successfully!');
      onPostComplete();
      onClose();
      setTitle('');
      setSummary('');
      setContent('');
      setImage('');
    } catch (error) {
      console.error('Failed to publish blog post:', error);
      alert('Failed to publish: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="blog-editor-overlay" onClick={onClose}>
      <div className="blog-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="blog-editor-header">
          Write New Blog Post
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="blog-editor-body">
          <input
            type="text"
            className="blog-title-input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            className="blog-summary-input"
            placeholder="Short Summary (optional)"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <input
            type="text"
            className="blog-image-input"
            placeholder="Header Image URL (optional)"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />
          <textarea
            className="blog-content-textarea"
            placeholder="Write your story here (Markdown supported)..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="blog-editor-actions">
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="publish-btn"
              disabled={isPublishing || !title || !content}
              onClick={handlePublish}
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
