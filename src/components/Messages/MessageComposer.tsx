/**
 * MessageComposer Component
 * Input area for composing and sending messages
 */

import { useState, useRef, useEffect } from 'react';
import './MessageComposer.css';

interface MessageComposerProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageComposer = ({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: MessageComposerProps) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }, [content]);

  const handleSend = async () => {
    if (!content.trim()) {
      setError('Message cannot be empty');
      return;
    }

    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      await onSend(content.trim());
      setContent('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMsg);
      console.error('Send error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-composer">
      {error && <div className="composer-error">{error}</div>}

      <div className="composer-input-container">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="composer-textarea"
          rows={1}
        />

        <button
          onClick={handleSend}
          disabled={disabled || loading || !content.trim()}
          className="composer-send-btn"
          title="Send (Cmd+Enter)"
        >
          {loading ? '⏳' : '✉️'}
        </button>
      </div>

      <div className="composer-hint">
        {loading ? 'Sending...' : 'Press Cmd/Ctrl + Enter to send'}
      </div>
    </div>
  );
};
