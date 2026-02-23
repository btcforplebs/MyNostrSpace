import { useEffect, useState, useCallback, useRef, memo, useLayoutEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter, NDKSubscriptionCacheUsage, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { isBlockedUser } from '../../utils/blockedUsers';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { SEO } from '../Shared/SEO';

interface ThreadNode {
  event: NDKEvent;
  children: ThreadNode[];
}

// Memoized thread item row to prevent unnecessary re-renders
const ThreadItemRow = memo(
  ({
    node,
    depth,
    highlightedEventId,
    onRenderThread,
  }: {
    node: ThreadNode;
    depth: number;
    highlightedEventId: string | null;
    onRenderThread: (nodes: ThreadNode[], depth: number) => React.ReactNode;
  }) => {
    const isHighlighted = node.event.id === highlightedEventId;
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (isHighlighted && ref.current) {
        setTimeout(() => {
          ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }, [isHighlighted]);

    return (
      <div
        ref={isHighlighted ? ref : undefined}
        className={`${depth > 0 ? 'nested-reply' : ''} ${isHighlighted ? 'highlighted-reply' : ''}`}
      >
        <FeedItem event={node.event} hideThreadButton={true} />
        {node.children.length > 0 && (
          <div className="reply-children">{onRenderThread(node.children, depth + 1)}</div>
        )}
      </div>
    );
  }
);

export const ThreadPage = () => {
  const { eventId } = useParams();
  const { ndk } = useNostr();
  const [rootEvent, setRootEvent] = useState<NDKEvent | null>(null);
  const [replies, setReplies] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [prevEventId, setPrevEventId] = useState(eventId);
  const repliesRef = useRef<Map<string, NDKEvent>>(new Map());

  // Reset state during render when eventId changes (props-from-state pattern)
  if (eventId !== prevEventId) {
    setPrevEventId(eventId);
    setLoading(true);
    setError(null);
    setIsBlocked(false);
    setRootEvent(null);
    setReplies([]);
    setHighlightedEventId(null);
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

    let cancelled = false;
    let replySubRef: ReturnType<typeof ndk.subscribe> | null = null;

    const fetchEventById = async (id: string): Promise<NDKEvent | null> => {
      try {
        let hexId = id;
        let relays: string[] = [];

        // Check if it's a bech32 ID
        if (id.startsWith('note1') || id.startsWith('nevent1')) {
          try {
            const decoded = nip19.decode(id);
            if (decoded.type === 'note') {
              hexId = decoded.data as string;
            } else if (decoded.type === 'nevent') {
              hexId = decoded.data.id;
              relays = decoded.data.relays || [];
            }
          } catch (e) {
            console.warn('Failed to decode bech32 ID:', id, e);
            return null;
          }
        }

        // Validate hex ID format
        if (!/^[0-9a-f]{64}$/.test(hexId)) {
          return null;
        }

        // Use fetchEvent for better management and reliability
        const event = await ndk.fetchEvent(
          { ids: [hexId] },
          { cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST },
          relays.length > 0 ? NDKRelaySet.fromRelayUrls(relays, ndk) : undefined
        );

        return event;
      } catch (err) {
        console.error('Error in fetchEventById:', id, err);
        return null;
      }
    };

    const loadReplies = async (rootId: string) => {
      setLoadingReplies(true);

      // Small delay to allow initial render to complete before heavy operations
      await new Promise(resolve => setTimeout(resolve, 50));

      const replyFilter: NDKFilter = {
        kinds: [1],
        '#e': [rootId],
      };

      const replySub = ndk.subscribe(replyFilter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });
      replySubRef = replySub;

      // Buffer replies and batch updates to prevent UI freezing
      let replyBuffer: NDKEvent[] = [];
      let flushTimeout: ReturnType<typeof setTimeout> | null = null;
      const FLUSH_INTERVAL = 400; // Batch updates every 400ms

      const flushBuffer = () => {
        if (replyBuffer.length === 0) return;

        const currentBuffer = [...replyBuffer];
        replyBuffer = [];

        // Process buffered replies
        const newReplies: NDKEvent[] = [];
        for (const reply of currentBuffer) {
          if (!repliesRef.current.has(reply.id) && !isBlockedUser(reply.pubkey)) {
            repliesRef.current.set(reply.id, reply);
            reply.author.fetchProfile().catch(() => { });
            newReplies.push(reply);
          }
        }

        // Only trigger re-render if we have new unique replies
        if (newReplies.length > 0) {
          setReplies(Array.from(repliesRef.current.values()));
        }
      };

      replySub.on('event', (reply: NDKEvent) => {
        replyBuffer.push(reply);

        if (!flushTimeout) {
          flushTimeout = setTimeout(() => {
            flushBuffer();
            flushTimeout = null;
          }, FLUSH_INTERVAL);
        }
      });

      replySub.on('eose', () => {
        // Flush any remaining buffered replies
        flushBuffer();
        setLoadingReplies(false);
      });

      // Stop listening for new replies after 30 seconds
      setTimeout(() => {
        flushBuffer();
        replySub.stop();
        setLoadingReplies(false);
      }, 30000);
    };

    const loadThread = async () => {
      // Phase 1: Fetch the clicked event
      const clickedEvent = await fetchEventById(eventId);

      if (cancelled) return;

      if (!clickedEvent) {
        setLoading(false);
        return;
      }

      if (isBlockedUser(clickedEvent.pubkey)) {
        setIsBlocked(true);
        setLoading(false);
        return;
      }

      // Phase 2: Check if the clicked event is a reply
      const eTags = clickedEvent.tags.filter((t) => t[0] === 'e');
      const rootMarkerTag = eTags.find((t) => t[3] === 'root');
      const trueRootId = rootMarkerTag
        ? rootMarkerTag[1]
        : eTags.length > 0
          ? eTags[0][1]
          : null;

      // If the clicked event is the root (no e-tags or root points to itself)
      if (!trueRootId || trueRootId === eventId) {
        clickedEvent.author.fetchProfile().catch(() => { });
        setRootEvent(clickedEvent);
        setHighlightedEventId(null);
        setLoading(false);
        loadReplies(clickedEvent.id);
        return;
      }

      // The clicked event is a reply — fetch the true root
      setHighlightedEventId(eventId);

      const actualRoot = await fetchEventById(trueRootId);

      if (cancelled) return;

      if (actualRoot && !isBlockedUser(actualRoot.pubkey)) {
        actualRoot.author.fetchProfile().catch(() => { });
        setRootEvent(actualRoot);
        setLoading(false);
        loadReplies(actualRoot.id);
      } else {
        // Fallback: if root can't be found, show clicked event as root
        clickedEvent.author.fetchProfile().catch(() => { });
        setRootEvent(clickedEvent);
        setHighlightedEventId(null);
        setLoading(false);
        // If we can't find the root, we can still show replies to the clicked event
        loadReplies(clickedEvent.id);
      }
    };

    const loadThreadWithTimeout = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Fetch timeout')), 10000)
        );
        await Promise.race([loadThread(), timeoutPromise]);
      } catch (err) {
        if (!cancelled) {
          console.error('Thread load failed:', err);
          setError(err instanceof Error ? err.message : 'Failed to load thread');
          setLoading(false);
        }
      }
    };

    loadThreadWithTimeout();

    return () => {
      cancelled = true;
      replySubRef?.stop();
    };
  }, [ndk, eventId]);

  const renderThread = useCallback(
    (nodes: ThreadNode[], depth: number = 0) => {
      const renderNodes = (currentNodes: ThreadNode[], currentDepth: number): React.ReactNode => {
        return currentNodes.map((node) => (
          <ThreadItemRow
            key={node.event.id}
            node={node}
            depth={currentDepth}
            highlightedEventId={highlightedEventId}
            onRenderThread={renderNodes}
          />
        ));
      };
      return renderNodes(nodes, depth);
    },
    [highlightedEventId]
  );

  return (
    <div className="thread-page-container">
      <div className="thread-page-wrapper">
        <Navbar />
        {rootEvent && (
          <SEO
            title={`${rootEvent.content.slice(0, 50)}${rootEvent.content.length > 50 ? '...' : ''}`}
            description={`Discussion on MyNostrSpace by ${rootEvent.author.profile?.displayName || rootEvent.author.profile?.name || 'an anonymous user'}.`}
            image={rootEvent.author.profile?.image}
            type="article"
          />
        )}
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

          {!loading && error && (
            <div style={{ padding: '20px', color: '#ff4444' }}>
              Error: {error === 'Fetch timeout' ? 'Request timed out. Please try refreshing.' : error}
            </div>
          )}

          {!loading && !error && !rootEvent && (
            <div style={{ padding: '20px' }}>
              {isBlocked
                ? 'Content from this user is blocked.'
                : 'Event not found. It might not have reached our relays yet.'}
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

        @media (max-width: 768px) {
          .reply-children {
            margin-left: 8px;
            padding-left: 5px;
            border-left: 1px solid #ddd;
          }
        }
        .nested-reply {
          margin-top: 10px;
        }
        .highlighted-reply {
          background-color: #fffde7;
          border-left: 3px solid #ff9933;
          padding-left: 8px;
        }
      `}</style>

      {/* Inject custom layout CSS LAST so it overrides defaults */}
      {layoutCss && <style>{layoutCss}</style>}
    </div>
  );
};
