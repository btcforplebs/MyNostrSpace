/**
 * Message Cache Service
 * Stores decrypted DM messages and conversation metadata in Dexie
 */

import Dexie, { type Table } from 'dexie';

export interface CachedDMMessage {
  id: string; // Event ID
  conversationWith: string; // Other participant's pubkey
  content: string; // Decrypted message content
  senderPubkey: string; // Who sent the message
  originalTimestamp: number; // Timestamp from the message
  receivedAt: number; // When we received/cached it
  isOutgoing: boolean; // Whether we sent this message
  read: boolean; // Whether message has been read
}

export interface ConversationMetadata {
  pubkey: string; // Participant pubkey (primary key)
  lastMessage: string; // Preview of last message
  lastMessageTime: number; // When last message arrived
  unreadCount: number; // Number of unread messages
  lastReadTimestamp: number; // When we last read messages
}

class MessageDB extends Dexie {
  messages!: Table<CachedDMMessage>;
  conversations!: Table<ConversationMetadata>;

  constructor() {
    super('mynostrspace-messages');
    this.version(1).stores({
      messages: '&id, conversationWith, originalTimestamp', // Indexes for querying
      conversations: '&pubkey, lastMessageTime',
    });
  }
}

export const db = new MessageDB();

/**
 * Add or update a cached message
 */
export async function addMessage(message: CachedDMMessage): Promise<void> {
  await db.messages.put(message);
}

/**
 * Get all messages for a specific conversation
 */
export async function getConversationMessages(pubkey: string): Promise<CachedDMMessage[]> {
  const messages = await db.messages.where('conversationWith').equals(pubkey).toArray();
  return messages.sort((a, b) => a.originalTimestamp - b.originalTimestamp);
}

/**
 * Get all messages (used for conversation grouping)
 */
export async function getAllMessages(): Promise<CachedDMMessage[]> {
  return db.messages.toArray();
}

/**
 * Get all conversations
 */
export async function getAllConversations(): Promise<ConversationMetadata[]> {
  return db.conversations.toArray();
}

/**
 * Get a specific conversation's metadata
 */
export async function getConversation(pubkey: string): Promise<ConversationMetadata | undefined> {
  return db.conversations.get(pubkey);
}

/**
 * Update conversation metadata
 */
export async function updateConversation(metadata: ConversationMetadata): Promise<void> {
  await db.conversations.put(metadata);
}

/**
 * Update message read status
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  const message = await db.messages.get(messageId);
  if (message) {
    message.read = true;
    await db.messages.put(message);
  }
}

/**
 * Mark all messages in a conversation as read
 */
export async function markConversationAsRead(pubkey: string): Promise<void> {
  const messages = await db.messages.where('conversationWith').equals(pubkey).toArray();
  for (const msg of messages) {
    msg.read = true;
  }
  await db.messages.bulkPut(messages);

  // Update conversation metadata
  const conv = await db.conversations.get(pubkey);
  if (conv) {
    conv.unreadCount = 0;
    conv.lastReadTimestamp = Math.floor(Date.now() / 1000);
    await db.conversations.put(conv);
  }
}

/**
 * Get unread count for a conversation
 */
export async function getUnreadCount(pubkey: string): Promise<number> {
  const messages = await db.messages
    .where('conversationWith')
    .equals(pubkey)
    .filter((msg) => !msg.read && !msg.isOutgoing)
    .toArray();
  return messages.length;
}

/**
 * Get total unread count across all conversations
 */
export async function getTotalUnreadCount(): Promise<number> {
  const messages = await db.messages.toArray();
  // Only count incoming, unread messages
  return messages.filter((msg) => !msg.read && !msg.isOutgoing).length;
}

/**
 * Mark all messages as read across all conversations
 */
export async function markAllAsRead(): Promise<void> {
  const messages = await db.messages.toArray();
  for (const msg of messages) {
    msg.read = true;
  }
  await db.messages.bulkPut(messages);

  // Update all conversation metadata
  const conversations = await db.conversations.toArray();
  for (const conv of conversations) {
    conv.unreadCount = 0;
    conv.lastReadTimestamp = Math.floor(Date.now() / 1000);
  }
  await db.conversations.bulkPut(conversations);
}

/**
 * Delete a message
 */
export async function deleteMessage(messageId: string): Promise<void> {
  await db.messages.delete(messageId);
}

/**
 * Delete all messages in a conversation
 */
export async function deleteConversation(pubkey: string): Promise<void> {
  const messages = await db.messages.where('conversationWith').equals(pubkey).primaryKeys();
  await db.messages.bulkDelete(messages);
  await db.conversations.delete(pubkey);
}

/**
 * Clear all messages and conversations
 */
export async function clearAllMessages(): Promise<void> {
  await db.messages.clear();
  await db.conversations.clear();
}

/**
 * Get messages since a specific timestamp
 */
export async function getMessagesSince(pubkey: string, since: number): Promise<CachedDMMessage[]> {
  const messages = await db.messages
    .where('conversationWith')
    .equals(pubkey)
    .filter((msg) => msg.originalTimestamp > since)
    .toArray();
  return messages.sort((a, b) => a.originalTimestamp - b.originalTimestamp);
}

/**
 * Get the most recent messages for conversation preview
 */
export async function getLastMessageForConversation(
  pubkey: string
): Promise<CachedDMMessage | undefined> {
  const messages = await db.messages.where('conversationWith').equals(pubkey).toArray();
  return messages.length > 0 ? messages[messages.length - 1] : undefined;
}

/**
 * Truncate message preview text for display
 */
export function truncateMessagePreview(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
