import { Link } from 'react-router-dom';
import { Navbar } from '../Shared/Navbar';
import '../Games/GamesPage.css'; // Reuse Games styling
import nestsImg from '../../assets/nostrnests.png';
import cornyImg from '../../assets/cornychat.png';
import hiveImg from '../../assets/hivetalk.png';

export interface RoomApp {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail: string;
}

export const ROOM_APPS: RoomApp[] = [
  {
    id: 'nostrnests',
    title: 'Nostr Nests',
    description: 'Audio spaces for Nostr. Join conversations or host your own.',
    url: 'https://nostrnests.com',
    thumbnail: nestsImg,
  },
  {
    id: 'cornychat',
    title: 'Corny Chat',
    description: 'Audio rooms and radio for Nostr.',
    url: 'https://cornychat.com',
    thumbnail: cornyImg,
  },
  {
    id: 'hivetalk',
    title: 'HiveTalk',
    description: 'Video and audio calls on Nostr.',
    url: 'https://hivetalk.org',
    thumbnail: hiveImg,
  },
];

export const RoomsPage = () => {
  return (
    <div className="games-page-container">
      <div className="games-wrapper">
        <Navbar />
        <div className="games-content">
          <h1 className="section-header">Rooms</h1>
          <p
            className="myspace-font"
            style={{ marginBottom: '20px', color: 'var(--myspace-text-muted)' }}
          >
            Join audio and video spaces on Nostr.
          </p>

          <div className="games-grid">
            {ROOM_APPS.map((app) => (
              <Link to={`/rooms/app/${app.id}`} key={app.id} className="game-card">
                <div className="game-thumbnail-wrapper">
                  <img src={app.thumbnail} alt={app.title} className="game-thumbnail" />
                </div>
                <div className="game-info">
                  <div className="game-title">{app.title}</div>
                  <div className="game-description">{app.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
