/**
 * useConversations Hook
 * Groups messages by conversation and provides conversation metadata
 */

import { useMemo } from 'react';
import type { CachedDMMessage } from '../services/messageCache';
import { truncateMessagePreview } from '../services/messageCache';

export interface Conversation {
  pubkey: string;
  lastMessage: string;
  lastMessageTime: number;
  lastMessageSender: string;
  unreadCount: number;
  messageCount: number;
  isOutgoing: boolean;
}

/**
 * Hook to group messages into conversations
 * @param messages Array of cached messages
 * @param userPubkey Current user's pubkey
 * @returns Sorted array of conversations with metadata
 */
export function useConversations(messages: CachedDMMessage[], userPubkey: string | null): Conversation[] {
  const conversations = useMemo(() => {
    if (!userPubkey || messages.length === 0) {
      return [];
    }

    // Group messages by conversation partner
    const conversationMap = new Map<string, CachedDMMessage[]>();

    messages.forEach((msg) => {
      const partner = msg.conversationWith;
      if (!conversationMap.has(partner)) {
        conversationMap.set(partner, []);
      }
      conversationMap.get(partner)!.push(msg);
    });

    // Convert to conversation metadata
    const conversations: Conversation[] = Array.from(conversationMap.entries()).map(([pubkey, msgs]) => {
      const lastMsg = msgs[msgs.length - 1];
      const unreadCount = msgs.filter((m) => !m.read && !m.isOutgoing).length;

      return {
        pubkey,
        lastMessage: truncateMessagePreview(lastMsg.content, 50),
        lastMessageTime: lastMsg.originalTimestamp,
        lastMessageSender: lastMsg.senderPubkey,
        unreadCount,
        messageCount: msgs.length,
        isOutgoing: lastMsg.isOutgoing,
      };
    });

    // Sort by most recent message first
    return conversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }, [messages, userPubkey]);

  return conversations;
}

/**
 * Hook to get conversation-specific information
 */
export function useConversation(
  pubkey: string | null,
  messages: CachedDMMessage[]
): {
  messages: CachedDMMessage[];
  unreadCount: number;
  lastMessageTime: number | null;
} {
  const conversationMessages = useMemo(() => {
    if (!pubkey) return [];
    return messages.filter((m) => m.conversationWith === pubkey).sort((a, b) => a.originalTimestamp - b.originalTimestamp);
  }, [messages, pubkey]);

  const unreadCount = useMemo(() => {
    return conversationMessages.filter((m) => !m.read && !m.isOutgoing).length;
  }, [conversationMessages]);

  const lastMessageTime = useMemo(() => {
    const lastMsg = conversationMessages[conversationMessages.length - 1];
    return lastMsg ? lastMsg.originalTimestamp : null;
  }, [conversationMessages]);

  return {
    messages: conversationMessages,
    unreadCount,
    lastMessageTime,
  };
}

/**
 * Format conversation display name (can be extended with profile names later)
 */
export function formatConversationName(pubkey: string): string {
  return pubkey.slice(0, 12) + '...';
}

/**
 * Format message timestamp for display
 */
export function formatMessageTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) {
    return 'now';
  } else if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  } else if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  } else if (diff < 604800) {
    return `${Math.floor(diff / 86400)}d ago`;
  } else {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
