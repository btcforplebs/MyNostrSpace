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

// Helper to extract parent and root IDs following NIP-10
const getThreadPointers = (event: NDKEvent) => {
  const eTags = event.tags.filter((t) => t[0] === 'e');
  if (eTags.length === 0) return { rootId: null, parentId: null };

  const rootTag = eTags.find((t) => t[3] === 'root') || eTags[0];
  const replyTag = eTags.find((t) => t[3] === 'reply') || (eTags.length > 1 ? eTags[eTags.length - 1] : eTags[0]);

  return {
    rootId: rootTag[1],
    parentId: replyTag[1],
  };
};

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
        style={{ position: 'relative' }}
      >
        <FeedItem event={node.event} hideThreadButton={true} />
        {node.children.length > 0 && (
          <div className="reply-children">
            {onRenderThread(node.children, depth + 1)}
          </div>
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

  // Optimized O(N) tree builder
  const buildTree = useCallback((rootId: string, allReplies: NDKEvent[]): ThreadNode[] => {
    const nodesMap = new Map<string, ThreadNode>();

    // Create nodes for all replies
    allReplies.forEach(event => {
      nodesMap.set(event.id, { event, children: [] });
    });

    const rootNodes: ThreadNode[] = [];

    allReplies.forEach(event => {
      const { parentId } = getThreadPointers(event);
      const node = nodesMap.get(event.id)!;

      if (parentId === rootId || !parentId) {
        rootNodes.push(node);
      } else {
        const parentNode = nodesMap.get(parentId);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          // Parent not found in fetched replies - treat as a top-level reply for now
          rootNodes.push(node);
        }
      }
    });

    // Sort all children by date
    const sortNodes = (nodes: ThreadNode[]) => {
      nodes.sort((a, b) => (a.event.created_at || 0) - (b.event.created_at || 0));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(rootNodes);

    return rootNodes;
  }, []);

  const threadTree = rootEvent ? buildTree(rootEvent.id, replies) : [];

  useEffect(() => {
    if (!ndk || !eventId) return;

    let cancelled = false;
    let replySubRef: ReturnType<typeof ndk.subscribe> | null = null;

    const fetchEventById = async (id: string, relayHints: string[] = []): Promise<NDKEvent | null> => {
      try {
        let hexId = id;
        let relays = [...relayHints];

        if (id.startsWith('note1') || id.startsWith('nevent1')) {
          try {
            const decoded = nip19.decode(id);
            if (decoded.type === 'note') {
              hexId = decoded.data as string;
            } else if (decoded.type === 'nevent') {
              hexId = decoded.data.id;
              relays = [...relays, ...(decoded.data.relays || [])];
            }
          } catch (e) {
            console.warn('Failed to decode bech32 ID:', id, e);
            return null;
          }
        }

        if (!/^[0-9a-f]{64}$/.test(hexId)) return null;

        return await ndk.fetchEvent(
          { ids: [hexId] },
          { cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST },
          relays.length > 0 ? NDKRelaySet.fromRelayUrls(relays, ndk) : undefined
        );
      } catch (err) {
        console.error('Error in fetchEventById:', id, err);
        return null;
      }
    };

    const loadReplies = async (rootId: string) => {
      setLoadingReplies(true);
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

      let replyBuffer: NDKEvent[] = [];
      let flushTimeout: ReturnType<typeof setTimeout> | null = null;
      const FLUSH_INTERVAL = 400;

      const flushBuffer = () => {
        if (replyBuffer.length === 0) return;
        const currentBuffer = [...replyBuffer];
        replyBuffer = [];

        const newReplies: NDKEvent[] = [];
        for (const reply of currentBuffer) {
          if (!repliesRef.current.has(reply.id) && !isBlockedUser(reply.pubkey)) {
            repliesRef.current.set(reply.id, reply);
            reply.author.fetchProfile().catch(() => { });
            newReplies.push(reply);
          }
        }

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
        flushBuffer();
        setLoadingReplies(false);
      });

      setTimeout(() => {
        flushBuffer();
        replySub.stop();
        setLoadingReplies(false);
      }, 30000);
    };

    const loadThreadRecursive = async () => {
      // 1. Fetch current event
      let currentEvent = await fetchEventById(eventId);
      if (cancelled) return;
      if (!currentEvent) {
        setLoading(false);
        return;
      }

      if (isBlockedUser(currentEvent.pubkey)) {
        setIsBlocked(true);
        setLoading(false);
        return;
      }

      // 2. Climb up the chain to find the absolute root
      setHighlightedEventId(eventId);
      let absoluteRoot = currentEvent;
      let visitedIds = new Set([currentEvent.id]);

      while (true) {
        const { rootId, parentId } = getThreadPointers(absoluteRoot);
        const nextId = rootId || parentId;

        if (!nextId || visitedIds.has(nextId)) break;

        console.log(`[Thread] Climbing to parent: ${nextId}`);
        const parent = await fetchEventById(nextId);
        if (!parent || cancelled) break;

        absoluteRoot = parent;
        visitedIds.add(parent.id);

        // If we found a note with no e-tags, it's the true root
        if (parent.tags.filter(t => t[0] === 'e').length === 0) break;
      }

      if (cancelled) return;

      absoluteRoot.author.fetchProfile().catch(() => { });
      setRootEvent(absoluteRoot);
      setLoading(false);
      loadReplies(absoluteRoot.id);
    };

    const loadThreadWithTimeout = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Fetch timeout')), 10000)
        );
        await Promise.race([loadThreadRecursive(), timeoutPromise]);
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

              {(threadTree.length > 0 || loadingReplies) && (
                <div className="thread-replies-container">
                  <div className="thread-replies-header">Replies</div>
                  {renderThread(threadTree)}
                  {loadingReplies && (
                    <div style={{ padding: '15px', color: '#888', fontStyle: 'italic', fontSize: '9pt' }}>
                      More replies loading...
                    </div>
                  )}
                </div>
              )}

              {threadTree.length === 0 && !loadingReplies && (
                <div style={{ padding: '15px', color: '#888', fontStyle: 'italic', fontSize: '9pt' }}>
                  No replies yet.
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
        .thread-replies-container {
          margin-top: 25px;
          border-top: 2px solid var(--myspace-orange);
          padding-top: 15px;
        }
        .thread-replies-header {
          font-weight: bold;
          font-size: 11pt;
          margin-bottom: 20px;
          color: var(--myspace-link);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .reply-children {
          margin-left: 20px;
          padding-left: 15px;
          border-left: 1px solid #ddd;
          position: relative;
        }
        
        /* Thread visual connectors */
        .reply-children::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          height: 30px;
          width: 15px;
          border-bottom: 1px solid #ddd;
          border-left: 1px solid #ddd;
          border-bottom-left-radius: 10px;
          display: none; /* Optional: simpler border-left is often cleaner */
        }

        @media (max-width: 768px) {
          .reply-children {
            margin-left: 10px;
            padding-left: 8px;
            border-left: 1px solid #eee;
          }
        }
        .nested-reply {
          margin-top: 15px;
        }
        .highlighted-reply {
          background-color: #fffde7;
          border-left: 3px solid #ff9933 !important;
          padding-left: 12px;
          margin-left: -12px;
          border-radius: 0 4px 4px 0;
        }
      `}</style>

      {/* Inject custom layout CSS LAST so it overrides defaults */}
      {layoutCss && <style>{layoutCss}</style>}
    </div>
  );
};
