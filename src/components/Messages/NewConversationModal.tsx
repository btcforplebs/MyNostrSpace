/**
 * NewConversationModal Component
 * Modal for starting a new direct message conversation
 */

import { useState, useRef, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { useProfile } from '../../hooks/useProfile';
import './NewConversationModal.css';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartConversation: (pubkey: string) => void;
}

/**
 * Convert an npub / nprofile / hex identifier to a hex pubkey.
 */
function decodePubkey(input: string): string | null {
  const trimmed = input.trim();

  // Already hex (don't lowercase bech32 — it would break the checksum).
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // Not a valid bech32 identifier.
  }

  return null;
}

export const NewConversationModal = ({
  isOpen,
  onClose,
  onStartConversation,
}: NewConversationModalProps) => {
  const [input, setInput] = useState('');
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { profile } = useProfile(pubkey || '');

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setInput('');
      setPubkey(null);
      setError(null);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    setError(null);

    if (!value.trim()) {
      setPubkey(null);
      return;
    }

    const decoded = decodePubkey(value);
    if (decoded) {
      setPubkey(decoded);
    } else {
      setError('Invalid pubkey format (use hex, npub, or nprofile)');
    }
  };

  const handleStart = async () => {
    if (!pubkey) {
      setError('Please enter a valid pubkey');
      return;
    }

    setLoading(true);
    try {
      onStartConversation(pubkey);
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start conversation';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStart();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Message</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="pubkey-input">User Pubkey</label>
            <input
              ref={inputRef}
              id="pubkey-input"
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Paste npub, nprofile, or hex pubkey..."
              disabled={loading}
              className="pubkey-input"
              spellCheck="false"
              autoComplete="off"
            />
            {error && <div className="input-error">{error}</div>}
          </div>

          {pubkey && (
            <div className="profile-preview">
              <h3>Profile Preview</h3>
              <div className="preview-content">
                {profile?.image && <img src={profile.image} alt="" className="preview-avatar" />}
                <div className="preview-info">
                  <div className="preview-name">{profile?.name || pubkey.slice(0, 16) + '...'}</div>
                  {profile?.about && <p className="preview-about">{profile.about}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn modal-btn-cancel" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={handleStart}
            disabled={!pubkey || loading}
          >
            {loading ? 'Starting...' : 'Start Conversation'}
          </button>
        </div>
      </div>
    </div>
  );
};
