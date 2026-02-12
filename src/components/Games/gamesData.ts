import flappyImg from '../../assets/flappy_nostrich.png';
import wordsImg from '../../assets/words_with_zaps.png';
import jesterImg from '../../assets/Jestr_chess.png';
import diceImg from '../../assets/nostr_dice.jpeg';
import bitariImg from '../../assets/bitari.png';

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
  {
    id: 'bitari',
    title: 'Bitari 2100 Arcade',
    description: 'A retro-themed arcade hub featuring Hash-out, Pow-man, and Dip Hopper.',
    url: 'https://bitari2100.vercel.app/arcade',
    thumbnail: bitariImg,
  },
];
