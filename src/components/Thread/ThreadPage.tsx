import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';

export const ThreadPage = () => {
  const { eventId } = useParams();
  const { ndk } = useNostr();
  const [rootEvent, setRootEvent] = useState<NDKEvent | null>(null);
  const [replies, setReplies] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk || !eventId) return;

    const fetchThread = async () => {
      setLoading(true);
      try {
        // 1. Fetch the specific event requested
        const event = await ndk.fetchEvent(eventId);
        if (!event) {
          setLoading(false);
          return;
        }
        await event.author.fetchProfile();

        // 2. Identify the true root of the thread if this is a reply
        // Check 'e' tags with 'root' marker, or first 'e' tag if no markers
        // For simplicity in this "View Thread" context, let's treat the clicked event as the focal point
        // But ideally we want to show the context (parents) and replies (children).

        // Let's just fetch the event and its direct children for now.
        setRootEvent(event);

        const replyFilter: NDKFilter = {
          kinds: [1],
          '#e': [event.id],
        };

        const replyEvents = await ndk.fetchEvents(replyFilter);
        const sortedReplies = Array.from(replyEvents).sort(
          (a, b) => (a.created_at || 0) - (b.created_at || 0)
        );

        await Promise.all(sortedReplies.map((r) => r.author.fetchProfile()));
        setReplies(sortedReplies);
      } catch (err) {
        console.error('Error fetching thread:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchThread();
  }, [ndk, eventId]);

  return (
    <div className="thread-page-container">
      <Navbar />
      <div className="thread-content">
        <div style={{ marginBottom: '10px' }}>
          <Link to="/" style={{ color: '#003399', fontSize: '9pt', fontWeight: 'bold' }}>
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Thread View</span>
        </div>

        {loading && <div>Loading thread...</div>}

        {!loading && !rootEvent && <div>Event not found.</div>}

        {!loading && rootEvent && (
          <div className="thread-root">
            <FeedItem event={rootEvent} />

            <div
              className="thread-replies"
              style={{
                marginLeft: '20px',
                marginTop: '20px',
                borderLeft: '1px solid #ddd',
                paddingLeft: '10px',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: '10pt', color: '#666' }}>Replies</h4>
              {replies.length === 0 && (
                <div style={{ color: '#888', fontStyle: 'italic', fontSize: '9pt' }}>
                  No replies yet.
                </div>
              )}
              {replies.map((reply) => (
                <div key={reply.id} style={{ marginBottom: '15px' }}>
                  <FeedItem event={reply} />
                </div>
              ))}
            </div>
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
                    border: 1px solid #6699cc;
                    margin-top: 10px;
                }
                .thread-replies {
                    margin-top: 20px;
                }
            `}</style>
    </div>
  );
};
