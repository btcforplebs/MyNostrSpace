/**
 * MessagesPage Component
 * Main inbox/conversation list view
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useNostr } from '../../context/NostrContext';
import { useMessages } from '../../hooks/useMessages';
import { useConversations, formatMessageTime, formatConversationName } from '../../hooks/useConversations';
import { useProfile } from '../../hooks/useProfile';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { getTotalUnreadCount, markAllAsRead } from '../../services/messageCache';
import { Navbar } from '../Shared/Navbar';
import { NewConversationModal } from './NewConversationModal';
import './MessagesPage.css';

export const MessagesPage = () => {
  const navigate = useNavigate();
  const { ndk, user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  // Subscribe to messages (uses NDK signer for decryption)
  const { messages, loading, error } = useMessages(
    loggedInUser?.pubkey || null,
    ndk
  );

  // Group into conversations
  const conversations = useConversations(messages, loggedInUser?.pubkey || null);

  // Update total unread count
  useEffect(() => {
    getTotalUnreadCount().then(setTotalUnread).catch(console.error);
  }, [messages]);

  if (!loggedInUser) {
    return (
      <div className="messages-page-not-logged-in">
        <Navbar />
        <div className="not-logged-in-message">
          <p>Please log in to view your messages</p>
        </div>
      </div>
    );
  }

  const handleStartConversation = (pubkey: string) => {
    navigate(`/messages/${pubkey}`);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setTotalUnread(0);
      // Small delay to ensure DB transaction completes, then reload to refresh conversation list
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const renderConversationList = () => {
    if (loading) {
      return <div className="loading-state">Loading messages...</div>;
    }

    if (error) {
      return <div className="error-state">Error loading messages: {error}</div>;
    }

    if (conversations.length === 0) {
      return (
        <div className="empty-state">
          <p>No conversations yet</p>
          <button className="start-conversation-btn" onClick={() => setIsNewConversationOpen(true)}>
            Start a conversation
          </button>
        </div>
      );
    }

    return (
      <div className="conversation-list">
        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.pubkey}
            conversation={conversation}
            onSelect={() => navigate(`/messages/${conversation.pubkey}`)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Messages {totalUnread > 0 ? `(${totalUnread})` : ''} - MyNostrSpace</title>
        <meta name="description" content="View and manage your direct messages" />
      </Helmet>

      <div className="messages-wrapper">
        <Navbar />
        <div className="messages-page">
          <div className="messages-header">
          <h1>Messages {totalUnread > 0 && <span className="unread-badge">{totalUnread}</span>}</h1>
          <div className="messages-header-buttons">
            {totalUnread > 0 && (
              <button className="read-all-btn" onClick={handleMarkAllAsRead}>
                Mark all as read
              </button>
            )}
            <button className="new-message-btn" onClick={() => setIsNewConversationOpen(true)}>
              ✉️ New Message
            </button>
          </div>
        </div>

        {renderConversationList()}

          <NewConversationModal
            isOpen={isNewConversationOpen}
            onClose={() => setIsNewConversationOpen(false)}
            onStartConversation={handleStartConversation}
          />
        </div>
      </div>

      <style>{layoutCss}</style>
    </>
  );
};

/**
 * Conversation list item component
 */
interface ConversationListItemProps {
  conversation: ReturnType<typeof useConversations>[0];
  onSelect: () => void;
}

const ConversationListItem = ({ conversation, onSelect }: ConversationListItemProps) => {
  const { profile } = useProfile(conversation.pubkey);

  const displayName = profile?.name || formatConversationName(conversation.pubkey);
  const timeLabel = formatMessageTime(conversation.lastMessageTime);

  return (
    <div className="conversation-item" onClick={onSelect}>
      <img
        src={
          profile?.image ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${conversation.pubkey}`
        }
        alt={displayName}
        className="conversation-avatar"
        loading="lazy"
      />

      <div className="conversation-info">
        <div className="conversation-header-row">
          <h3 className="conversation-name">{displayName}</h3>
          <span className="conversation-time">{timeLabel}</span>
        </div>

        <p className="conversation-preview">{conversation.lastMessage}</p>
      </div>

      {conversation.unreadCount > 0 && (
        <div className="unread-indicator">
          <span className="unread-count">{conversation.unreadCount}</span>
        </div>
      )}
    </div>
  );
};
