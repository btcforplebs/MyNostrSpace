import { useEffect, useState, useCallback, useRef, memo, useLayoutEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { isBlockedUser } from '../../utils/blockedUsers';
import { useCustomLayout } from '../../hooks/useCustomLayout';

interface ThreadNode {
  event: NDKEvent;
  children: ThreadNode[];
}

// Memoized thread item row to prevent unnecessary re-renders
const ThreadItemRow = memo(
  ({
    node,
    depth,
    onRenderThread,
  }: {
    node: ThreadNode;
    depth: number;
    onRenderThread: (nodes: ThreadNode[], depth: number) => React.ReactNode;
  }) => (
    <div className={depth > 0 ? 'nested-reply' : ''}>
      <FeedItem event={node.event} hideThreadButton={true} />
      {node.children.length > 0 && (
        <div className="reply-children">{onRenderThread(node.children, depth + 1)}</div>
      )}
    </div>
  )
);

export const ThreadPage = () => {
  const { eventId } = useParams();
  const { ndk } = useNostr();
  const [rootEvent, setRootEvent] = useState<NDKEvent | null>(null);
  const [replies, setReplies] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [prevEventId, setPrevEventId] = useState(eventId);
  const repliesRef = useRef<Map<string, NDKEvent>>(new Map());

  // Reset state during render when eventId changes (props-from-state pattern)
  if (eventId !== prevEventId) {
    setPrevEventId(eventId);
    setLoading(true);
    setRootEvent(null);
    setReplies([]);
  }

  // Clear ref in layout effect to avoid "refs during render" error
  useLayoutEffect(() => {
    if (eventId !== prevEventId) {
      repliesRef.current.clear();
    }
  }, [eventId, prevEventId]);

  // Get custom layout for the root event author
  const { layoutCss } = useCustomLayout(rootEvent?.pubkey);

  // Build tree from flat replies list
  const buildTree = useCallback((parentId: string, allReplies: NDKEvent[]): ThreadNode[] => {
    const fetchChildren = (pid: string): ThreadNode[] => {
      const children = allReplies.filter((reply) => {
        const eTags = reply.tags.filter((t) => t[0] === 'e');
        const replyMarkerTag = eTags.find((t) => t[3] === 'reply');
        const directParentId = replyMarkerTag
          ? replyMarkerTag[1]
          : eTags.length > 0
            ? eTags[eTags.length - 1][1]
            : null;
        return directParentId === pid;
      });

      return children
        .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
        .map((child) => ({
          event: child,
          children: fetchChildren(child.id),
        }));
    };

    return fetchChildren(parentId);
  }, []);

  const threadTree = rootEvent ? buildTree(rootEvent.id, replies) : [];

  useEffect(() => {
    if (!ndk || !eventId) return;

    // Fetch root event
    const rootSub = ndk.subscribe(
      { ids: [eventId] },
      { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }
    );

    rootSub.on('event', async (event: NDKEvent) => {
      // Fetch author profile in background
      event.author.fetchProfile().catch(() => { });

      if (isBlockedUser(event.pubkey)) {
        setLoading(false);
        return;
      }

      setRootEvent(event);
      setLoading(false);

      // Now fetch replies
      setLoadingReplies(true);
      const replyFilter: NDKFilter = {
        kinds: [1],
        '#e': [event.id],
      };

      const replySub = ndk.subscribe(replyFilter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });

      replySub.on('event', (reply: NDKEvent) => {
        if (!repliesRef.current.has(reply.id) && !isBlockedUser(reply.pubkey)) {
          repliesRef.current.set(reply.id, reply);
          reply.author.fetchProfile().catch(() => { });
          setReplies(Array.from(repliesRef.current.values()));
        }
      });

      replySub.on('eose', () => {
        setLoadingReplies(false);
      });

      // Stop listening for new replies after 30 seconds
      setTimeout(() => {
        replySub.stop();
        setLoadingReplies(false);
      }, 30000);
    });

    rootSub.on('eose', () => {
      // If no event found after EOSE, stop loading
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    });

    return () => {
      rootSub.stop();
    };
  }, [ndk, eventId]);

  const renderThread = useCallback((nodes: ThreadNode[], depth: number = 0) => {
    const renderNodes = (currentNodes: ThreadNode[], currentDepth: number): React.ReactNode => {
      return currentNodes.map((node) => (
        <ThreadItemRow
          key={node.event.id}
          node={node}
          depth={currentDepth}
          onRenderThread={renderNodes}
        />
      ));
    };
    return renderNodes(nodes, depth);
  }, []);

  return (
    <div className="thread-page-container">
      <div className="thread-page-wrapper">
        <Navbar />
        <div className="thread-content">
          <div style={{ marginBottom: '10px' }}>
            <Link
              to="/"
              style={{
                color: 'var(--myspace-link)',
                fontSize: '9pt',
                fontWeight: 'bold',
                textDecoration: 'none',
              }}
            >
              &laquo; Back to Home
            </Link>
          </div>

          <div
            style={{
              backgroundColor: 'var(--myspace-orange)',
              color: 'black',
              padding: '3px 5px',
              fontSize: '10pt',
              fontWeight: 'bold',
            }}
          >
            Thread View
          </div>

          {loading && <div style={{ padding: '20px' }}>Loading thread...</div>}

          {!loading && !rootEvent && (
            <div style={{ padding: '20px' }}>
              {isBlockedUser(eventId || '')
                ? 'Content from this user is blocked.'
                : 'Event not found.'}
            </div>
          )}

          {!loading && rootEvent && (
            <div className="thread-root" style={{ marginTop: '10px' }}>
              <FeedItem event={rootEvent} hideThreadButton={true} />

              {threadTree.length > 0 && (
                <div style={{ marginTop: '15px' }}>{renderThread(threadTree)}</div>
              )}

              {threadTree.length === 0 && !loadingReplies && (
                <div
                  style={{ padding: '15px', color: '#888', fontStyle: 'italic', fontSize: '9pt' }}
                >
                  No replies yet.
                </div>
              )}

              {loadingReplies && (
                <div
                  style={{ padding: '15px', color: '#888', fontStyle: 'italic', fontSize: '9pt' }}
                >
                  Loading replies...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .thread-page-container {
          background-color: var(--myspace-bg);
          min-height: 100vh;
          font-family: verdana, arial, sans-serif, helvetica;
          padding: 0;
        }
        .thread-page-wrapper {
          max-width: 992px;
          margin: 0 auto;
          background-color: var(--myspace-bg-content);
          min-height: 100vh;
          box-shadow: 0 0 15px rgba(0,0,0,0.1);
        }
        .thread-content {
          padding: 15px;
          border: 1px solid var(--myspace-border);
          border-top: none;
          color: var(--myspace-text);
        }
        .thread-root {
          padding: 10px;
        }
        .reply-children {
          margin-left: 20px;
          padding-left: 10px;
          border-left: 2px solid #ddd;
        }
        .nested-reply {
          margin-top: 10px;
        }
      `}</style>

      {/* Inject custom layout CSS LAST so it overrides defaults */}
      {layoutCss && <style>{layoutCss}</style>}
    </div>
  );
};
