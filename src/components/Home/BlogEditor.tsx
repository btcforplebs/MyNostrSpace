import React, { useState, useRef } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';
import './BlogEditor.css';

interface BlogEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onPostComplete: () => void;
}

const renderMarkdown = (md: string): string => {
  let html = md
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%"/>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // H3
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // H2
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // H1
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Unordered list items
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs: wrap remaining lines
  html = html
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<li') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<hr') ||
        trimmed.startsWith('<img')
      ) {
        return line;
      }
      return `<p>${line}</p>`;
    })
    .join('\n');

  return html;
};

export const BlogEditor: React.FC<BlogEditorProps> = ({ isOpen, onClose, onPostComplete }) => {
  const { ndk, user } = useNostr();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!isOpen) return null;

  const insertMarkdown = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const text = selected || placeholder;
    const newContent =
      content.substring(0, start) + before + text + after + content.substring(end);
    setContent(newContent);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + before.length + text.length;
      textarea.selectionStart = selected ? cursorPos + after.length : start + before.length;
      textarea.selectionEnd = selected ? cursorPos + after.length : cursorPos;
    });
  };

  const insertLine = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newContent =
      content.substring(0, lineStart) + prefix + content.substring(lineStart);
    setContent(newContent);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
    });
  };

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
        ['client', 'MyNostrSpace'],
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
      setShowPreview(false);
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
            className="blog-title-input nostr-input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            className="blog-summary-input nostr-input"
            placeholder="Short Summary (optional)"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <input
            type="text"
            className="blog-image-input nostr-input"
            placeholder="Header Image URL (optional)"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />

          <div className="blog-toolbar">
            <button type="button" title="Bold" onClick={() => insertMarkdown('**', '**', 'bold text')}>
              <b>B</b>
            </button>
            <button type="button" title="Italic" onClick={() => insertMarkdown('*', '*', 'italic text')}>
              <i>I</i>
            </button>
            <button type="button" title="Strikethrough" onClick={() => insertMarkdown('~~', '~~', 'strikethrough')}>
              <s>S</s>
            </button>
            <span className="toolbar-divider" />
            <button type="button" title="Heading 1" onClick={() => insertLine('# ')}>
              H1
            </button>
            <button type="button" title="Heading 2" onClick={() => insertLine('## ')}>
              H2
            </button>
            <button type="button" title="Heading 3" onClick={() => insertLine('### ')}>
              H3
            </button>
            <span className="toolbar-divider" />
            <button type="button" title="Link" onClick={() => insertMarkdown('[', '](url)', 'link text')}>
              Link
            </button>
            <button type="button" title="Image" onClick={() => insertMarkdown('![', '](url)', 'alt text')}>
              Img
            </button>
            <span className="toolbar-divider" />
            <button type="button" title="Blockquote" onClick={() => insertLine('> ')}>
              Quote
            </button>
            <button type="button" title="Code Block" onClick={() => insertMarkdown('```\n', '\n```', 'code')}>
              Code
            </button>
            <button type="button" title="Bullet List" onClick={() => insertLine('- ')}>
              List
            </button>
            <button type="button" title="Horizontal Rule" onClick={() => insertMarkdown('\n---\n', '', '')}>
              HR
            </button>
            <span className="toolbar-divider" />
            <button
              type="button"
              className={`toolbar-preview-btn ${showPreview ? 'active' : ''}`}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {showPreview ? (
            <div
              className="blog-preview"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : (
            <textarea
              ref={textareaRef}
              className="blog-content-textarea nostr-input"
              placeholder="Write your story here (Markdown supported)..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}

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
