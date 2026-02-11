import { Link } from 'react-router-dom';
import { Navbar } from '../Shared/Navbar';
import './GamesPage.css';
import flappyImg from '../../assets/flappy_nostrich.png';
import wordsImg from '../../assets/words_with_zaps.png';
import jesterImg from '../../assets/Jestr_chess.png';
import diceImg from '../../assets/nostr_dice.jpeg';

export interface Game {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail: string;
}

export const GAMES_LIST: Game[] = [
  {
    id: 'flappy',
    title: 'Flappy Nostrich',
    description:
      'Fly through the Bitcoin price charts! A Nostr-themed take on the classic Flappy Bird.',
    url: 'https://flappy-nostrich.vercel.app',
    thumbnail: flappyImg,
  },
  {
    id: 'words',
    title: 'Words with Zaps',
    description: 'A crossword-style word game. Play against friends and zap them!',
    url: 'https://www.wordswithzaps.top',
    thumbnail: wordsImg,
  },
  {
    id: 'jester',
    title: 'Jester Chess',
    description: 'Play Chess over Nostr. Challenge your friends to a battle of wits.',
    url: 'https://jesterui.github.io/',
    thumbnail: jesterImg,
  },
  {
    id: 'nostrdice',
    title: 'NostrDice',
    description: 'Provably fair dice game using Lightning Network.',
    url: 'https://app.nostrdice.com',
    thumbnail: diceImg,
  },
];

export const GamesPage = () => {
  return (
    <div className="games-page-container">
      <div className="games-wrapper">
        <Navbar />
        <div className="games-content">
          <h1 className="section-header">Arcade</h1>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            Play games powered by Nostr and Lightning.
          </p>

          <div className="games-grid">
            {GAMES_LIST.map((game) => (
              <Link to={`/game/${game.id}`} key={game.id} className="game-card">
                <div className="game-thumbnail-wrapper">
                  <img src={game.thumbnail} alt={game.title} className="game-thumbnail" />
                </div>
                <div className="game-info">
                  <div className="game-title">{game.title}</div>
                  <div className="game-description">{game.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
