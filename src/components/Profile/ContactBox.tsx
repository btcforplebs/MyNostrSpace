import { Mail, Send, UserPlus, Star, MessageSquare, Ban, Users, Trophy } from 'lucide-react';
import './ProfilePage.css';
import { useFriends } from '../../hooks/useFriends';

interface ContactBoxProps {
  name?: string;
  pubkey?: string;
  onAwardBadge?: () => void;
  showAwardButton?: boolean;
}

export const ContactBox = ({ name, pubkey, onAwardBadge, showAwardButton }: ContactBoxProps) => {
  const { followUser } = useFriends(pubkey); // We typically pass the Profile owner's pubkey to useFriends to viewing their friends, but here we just need the function.
  // Actually, useFriends(pubkey) fetches THAT pubkey's friends.
  // The followUser function inside useFriends uses `ndk.activeUser`.
  // So valid to call it, but maybe cleaner to have a separate hook or just use useFriends without arg?
  // Let's just use it.

  const handleAddFriend = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (pubkey) {
      await followUser(pubkey);
    }
  };

  return (
    <div className="contact-box">
      <h3 className="section-header">Contacting {name}</h3>
      <div className="contact-grid">
        <div className="contact-item">
          <Mail size={16} />{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Coming soon!');
            }}
          >
            Send Message
          </a>
        </div>
        <div className="contact-item">
          <Send size={16} />{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Coming soon!');
            }}
          >
            Forward to Friend
          </a>
        </div>
        <div className="contact-item">
          <UserPlus size={16} />{' '}
          <a href="#" onClick={handleAddFriend}>
            Add to Friends
          </a>
        </div>
        <div className="contact-item">
          <Star size={16} />{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Coming soon!');
            }}
          >
            Add to Favorites
          </a>
        </div>
        <div className="contact-item">
          <MessageSquare size={16} />{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Coming soon!');
            }}
          >
            Instant Message
          </a>
        </div>
        <div className="contact-item">
          <Ban size={16} />{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Coming soon!');
            }}
          >
            Block User
          </a>
        </div>
        <div className="contact-item">
          <Users size={16} />{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Coming soon!');
            }}
          >
            Add to Group
          </a>
        </div>
        {showAwardButton && (
          <div className="contact-item">
            <Trophy size={16} />{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onAwardBadge?.();
              }}
            >
              Give Badge
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
