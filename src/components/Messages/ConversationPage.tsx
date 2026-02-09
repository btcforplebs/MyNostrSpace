/**
 * ConversationPage Component
 * Displays full conversation thread with a specific user
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useNostr } from '../../context/NostrContext';
import { useMessages } from '../../hooks/useMessages';
import { useConversation } from '../../hooks/useConversations';
import { useProfile } from '../../hooks/useProfile';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { MessageItem } from './MessageItem';
import { MessageComposer } from './MessageComposer';
import { markConversationAsRead, addMessage } from '../../services/messageCache';
import { Navbar } from '../Shared/Navbar';
import './ConversationPage.css';

export const ConversationPage = () => {
  const { pubkey: conversationWith } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const { ndk, user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const { profile } = useProfile(conversationWith || '');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to messages (uses NDK signer for decryption)
  const { messages: allMessages, loading } = useMessages(
    loggedInUser?.pubkey || null,
    ndk
  );

  // Filter messages for this conversation
  const { messages: conversationMessages, unreadCount } = useConversation(conversationWith || null, allMessages);

  // Validate URL param
  if (!conversationWith) {
    return (
      <div className="conversation-error">
        <p>Invalid conversation URL</p>
        <button onClick={() => navigate('/messages')}>Back to messages</button>
      </div>
    );
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages]);

  // Mark conversation as read when entering
  useEffect(() => {
    if (unreadCount > 0) {
      markConversationAsRead(conversationWith).catch((err) => {
        console.error('Failed to mark as read:', err);
      });
    }
  }, [conversationWith, unreadCount]);

  const handleSendMessage = async (content: string) => {
    if (!loggedInUser || !ndk || !ndk.signer) {
      setError('Not logged in');
      return;
    }

    if (!conversationWith) {
      setError('Invalid recipient');
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Encrypt message using signer's NIP-04 support (works with all current signers)
      let encryptedContent: string;
      try {
        encryptedContent = await (ndk.signer as any).encrypt?.(
          { pubkey: conversationWith } as any,
          content
        );
      } catch (encryptErr) {
        throw new Error(`Encryption failed: ${encryptErr instanceof Error ? encryptErr.message : String(encryptErr)}`);
      }

      if (!encryptedContent) {
        throw new Error('Failed to encrypt message');
      }

      // Create a kind 4 (legacy DM) event
      const dmEvent = new NDKEvent(ndk, {
        kind: 4,
        content: encryptedContent,
        tags: [['p', conversationWith]],
        created_at: Math.floor(Date.now() / 1000),
      });

      // Sign and publish the event
      await dmEvent.sign(ndk.signer);
      console.log('📤 Publishing DM event:', dmEvent.id);

      await dmEvent.publish();

      console.log('✅ Message sent successfully');

      // Optimistically add to local cache
      const messageId = dmEvent.id;
      await addMessage({
        id: messageId,
        conversationWith,
        content,
        senderPubkey: loggedInUser.pubkey,
        originalTimestamp: Math.floor(Date.now() / 1000),
        receivedAt: Math.floor(Date.now() / 1000),
        isOutgoing: true,
        read: true,
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMsg);
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

  const displayName = profile?.name || conversationWith.slice(0, 12) + '...';

  return (
    <>
      <Helmet>
        <title>Chat with {displayName} - MyNostrSpace</title>
        <meta name="description" content={`Private message conversation with ${displayName}`} />
      </Helmet>

      <div className="conversation-wrapper">
        <Navbar />
        <div className="conversation-page">
          <div className="conversation-header">
          <button className="back-button" onClick={() => navigate('/messages')}>
            ← Messages
          </button>
          <div className="header-info">
            <h2>{displayName}</h2>
            {loading && <span className="loading-indicator">Loading...</span>}
          </div>
        </div>

        <div className="conversation-messages">
          <div className="nip04-privacy-banner">
            <p><strong>ℹ️ Privacy Notice:</strong> These messages use NIP-04 encryption. Your message content is encrypted, but other users can see <strong>who you are messaging</strong>. For metadata-private messaging, NIP-17 will be available when signers support NIP-44 encryption.</p>
          </div>

          {error && (
            <div className="conversation-error-banner">
              <p><strong>⚠️ Messaging Issue:</strong></p>
              <p>{error}</p>
            </div>
          )}

          {loading && conversationMessages.length === 0 && (
            <div className="loading-state">
              <p>Loading messages...</p>
            </div>
          )}

          {conversationMessages.length === 0 && !loading && !error ? (
            <div className="no-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            conversationMessages.map((message) => <MessageItem key={message.id} message={message} />)
          )}
          <div ref={messagesEndRef} />
        </div>

          <MessageComposer onSend={handleSendMessage} disabled={sending || !loggedInUser} />
        </div>
      </div>

      <style>{layoutCss}</style>
    </>
  );
};
