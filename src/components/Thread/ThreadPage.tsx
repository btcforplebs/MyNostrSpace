import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';

interface ThreadNode {
  event: NDKEvent;
  children: ThreadNode[];
}

export const ThreadPage = () => {
  const { eventId } = useParams();
  const { ndk } = useNostr();
  const [rootEvent, setRootEvent] = useState<NDKEvent | null>(null);
  const [threadTree, setThreadTree] = useState<ThreadNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk || !eventId) return;

    const fetchThread = async () => {
      setLoading(true);
      try {
        // 1. Fetch the root event
        const event = await ndk.fetchEvent(eventId);
        if (!event) {
          setLoading(false);
          return;
        }
        await event.author.fetchProfile();
        setRootEvent(event);

        // 2. Fetch ALL replies to this event
        const replyFilter: NDKFilter = {
          kinds: [1],
          '#e': [event.id],
        };

        const replyEvents = await ndk.fetchEvents(replyFilter);
        const allReplies = Array.from(replyEvents);

        // Fetch profiles for all replies
        await Promise.all(allReplies.map((r) => r.author.fetchProfile()));

        // 3. Build a tree structure
        const buildTree = (parentId: string): ThreadNode[] => {
          const children = allReplies.filter((reply) => {
            const eTags = reply.tags.filter((t) => t[0] === 'e');

            // Find the direct parent (reply marker or last e-tag)
            const replyMarkerTag = eTags.find((t) => t[3] === 'reply');
            const directParentId = replyMarkerTag
              ? replyMarkerTag[1]
              : eTags.length > 0
                ? eTags[eTags.length - 1][1]
                : null;

            return directParentId === parentId;
          });

          return children
            .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
            .map((child) => ({
              event: child,
              children: buildTree(child.id),
            }));
        };

        const tree = buildTree(event.id);
        setThreadTree(tree);
      } catch (err) {
        console.error('Error fetching thread:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchThread();
  }, [ndk, eventId]);

  const renderThread = (nodes: ThreadNode[], depth: number = 0) => {
    return nodes.map((node) => (
      <div key={node.event.id} style={{ marginBottom: '10px' }}>
        <div
          style={{
            marginLeft: depth > 0 ? '30px' : '0',
            borderLeft: depth > 0 ? '2px solid #6699cc' : 'none',
            paddingLeft: depth > 0 ? '10px' : '0',
          }}
        >
          <FeedItem event={node.event} hideThreadButton={true} />
        </div>
        {node.children.length > 0 && renderThread(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="thread-page-container">
      <Navbar />
      <div className="thread-content">
        <div style={{ marginBottom: '10px' }}>
          <Link
            to="/"
            style={{
              color: '#003399',
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
            backgroundColor: '#ff9933',
            color: 'black',
            padding: '3px 5px',
            fontSize: '10pt',
            fontWeight: 'bold',
          }}
        >
          Thread View
        </div>

        {loading && <div style={{ padding: '20px' }}>Loading thread...</div>}

        {!loading && !rootEvent && <div style={{ padding: '20px' }}>Event not found.</div>}

        {!loading && rootEvent && (
          <div className="thread-root" style={{ marginTop: '10px' }}>
            <FeedItem event={rootEvent} hideThreadButton={true} />

            {threadTree.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                {renderThread(threadTree)}
              </div>
            )}

            {threadTree.length === 0 && (
              <div style={{ padding: '15px', color: '#888', fontStyle: 'italic', fontSize: '9pt' }}>
                No replies yet.
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .thread-page-container {
          background-color: #e5e5e5;
          min-height: 100vh;
          font-family: verdana, arial, sans-serif, helvetica;
          padding: 10px 0;
        }
        .thread-content {
          max-width: 800px;
          margin: 0 auto;
          padding: 10px;
          background-color: white;
          border: 1px solid #ccc;
          margin-top: 10px;
          color: black;
        }
        .thread-root {
          padding: 10px;
        }
      `}</style>
    </div>
  );
};
