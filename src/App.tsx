import { Routes, Route } from 'react-router-dom';
import { useNostr } from './context/NostrContext';
import { HelmetProvider } from 'react-helmet-async';
import { LightboxProvider } from './context/LightboxContext';
import { Lightbox } from './components/Shared/Lightbox';
import ProfilePage from './components/Profile/ProfilePage';
import { LayoutEditor } from './components/Customization/LayoutEditor';
import EditProfilePage from './components/Profile/EditProfilePage';
import FriendsPage from './components/Friends/FriendsPage';
import { SearchPage } from './components/Search/SearchPage';
import { BrowsePage } from './components/Browse/BrowsePage';

import { LandingPage } from './components/Landing/LandingPage';
import HomePage from './components/Home/HomePage';
import { RelaySettings } from './components/Settings/RelaySettings';
import { ThreadPage } from './components/Thread/ThreadPage';
import { BlogPage } from './components/Blog/BlogPage';
import { LiveStreamPage } from './components/Live/LiveStreamPage';
import { LivestreamsPage } from './components/Live/LivestreamsPage';
import { MusicPage } from './components/Music/MusicPage';
import { FilmPage } from './components/Film/FilmPage';
import { BlogsPage } from './components/Blog/BlogsPage';
import { VideosPage } from './components/Video/VideosPage';
import { ErrorBoundary } from './components/Shared/ErrorBoundary';

function App() {
  const { user, isLoading } = useNostr();

  const hasSavedSession =
    !!localStorage.getItem('mynostrspace_pubkey') ||
    !!localStorage.getItem('mynostrspace_semiconnected_bunker');

  if (isLoading && hasSavedSession) {
    return (
      <div className="loading-screen">
        <div className="loading-box">
          <div className="loading-header">MyNostrSpace.com</div>
          <div className="loading-body">
            <p>Connecting to Nostr...</p>
            <p style={{ fontSize: '8pt' }}>(Please Wait)</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <LightboxProvider>
        <div className="app-container">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={user ? <HomePage /> : <LandingPage />} />
              <Route path="/p/:pubkey" element={<ProfilePage />} />
              <Route path="/p/:pubkey/friends" element={<FriendsPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/edit-layout" element={<LayoutEditor />} />
              <Route path="/edit-profile" element={<EditProfilePage />} />
              <Route path="/settings" element={<RelaySettings />} />
              <Route path="/thread/:eventId" element={<ThreadPage />} />
              <Route path="/blog/:pubkey/:identifier" element={<BlogPage />} />
              <Route path="/live/:pubkey/:identifier" element={<LiveStreamPage />} />
              <Route path="/livestreams" element={<LivestreamsPage />} />
              <Route path="/blogs" element={<BlogsPage />} />
              <Route path="/videos" element={<VideosPage />} />
              <Route path="/music" element={<MusicPage />} />
              <Route path="/film" element={<FilmPage />} />
            </Routes>
          </ErrorBoundary>
        </div>
        <Lightbox />
      </LightboxProvider>
    </HelmetProvider>
  );
}

export default App;
