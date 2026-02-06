import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useNostr } from './context/NostrContext';
import { HelmetProvider } from 'react-helmet-async';
import { LightboxProvider } from './context/LightboxContext';
import { Lightbox } from './components/Shared/Lightbox';
const ProfilePage = lazy(() => import('./components/Profile/ProfilePage'));
const LayoutEditor = lazy(() =>
  import('./components/Customization/LayoutEditor').then((m) => ({ default: m.LayoutEditor }))
);
const EditProfilePage = lazy(() => import('./components/Profile/EditProfilePage'));
const FriendsPage = lazy(() => import('./components/Friends/FriendsPage'));
const SearchPage = lazy(() =>
  import('./components/Search/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const BrowsePage = lazy(() =>
  import('./components/Browse/BrowsePage').then((m) => ({ default: m.BrowsePage }))
);
const LandingPage = lazy(() =>
  import('./components/Landing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const HomePage = lazy(() => import('./components/Home/HomePage'));
const SettingsPage = lazy(() =>
  import('./components/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const ThreadPage = lazy(() =>
  import('./components/Thread/ThreadPage').then((m) => ({ default: m.ThreadPage }))
);
const BlogPage = lazy(() =>
  import('./components/Blog/BlogPage').then((m) => ({ default: m.BlogPage }))
);
const LiveStreamPage = lazy(() =>
  import('./components/Live/LiveStreamPage').then((m) => ({ default: m.LiveStreamPage }))
);
const LivestreamsPage = lazy(() =>
  import('./components/Live/LivestreamsPage').then((m) => ({ default: m.LivestreamsPage }))
);
const MusicPage = lazy(() =>
  import('./components/Music/MusicPage').then((m) => ({ default: m.MusicPage }))
);
const FilmPage = lazy(() =>
  import('./components/Film/FilmPage').then((m) => ({ default: m.FilmPage }))
);
const BlogsPage = lazy(() =>
  import('./components/Blog/BlogsPage').then((m) => ({ default: m.BlogsPage }))
);
const VideosPage = lazy(() =>
  import('./components/Video/VideosPage').then((m) => ({ default: m.VideosPage }))
);
const PhotosPage = lazy(() =>
  import('./components/Photos/PhotosPage').then((m) => ({ default: m.PhotosPage }))
);
const MarketplacePage = lazy(() =>
  import('./components/Marketplace/MarketplacePage').then((m) => ({ default: m.MarketplacePage }))
);
const CalendarPage = lazy(() =>
  import('./components/Calendar/CalendarPage').then((m) => ({ default: m.CalendarPage }))
);
const RecipesPage = lazy(() =>
  import('./components/Recipe/RecipesPage').then((m) => ({ default: m.RecipesPage }))
);
const BadgesPage = lazy(() =>
  import('./components/Badges/BadgesPage').then((m) => ({ default: m.BadgesPage }))
);
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
            <Suspense
              fallback={
                <div className="loading-screen">
                  <div className="loading-box">
                    <div className="loading-body">
                      <p>Loading...</p>
                    </div>
                  </div>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={user ? <HomePage /> : <LandingPage />} />
                <Route path="/p/:pubkey" element={<ProfilePage />} />
                <Route path="/p/:pubkey/friends" element={<FriendsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/browse" element={<BrowsePage />} />
                <Route path="/edit-layout" element={<LayoutEditor />} />
                <Route path="/edit-profile" element={<EditProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/thread/:eventId" element={<ThreadPage />} />
                <Route path="/blog/:pubkey/:identifier" element={<BlogPage />} />
                <Route path="/live/:pubkey/:identifier" element={<LiveStreamPage />} />
                <Route path="/livestreams" element={<LivestreamsPage />} />
                <Route path="/blogs" element={<BlogsPage />} />
                <Route path="/videos" element={<VideosPage />} />
                <Route path="/photos" element={<PhotosPage />} />
                <Route path="/marketplace" element={<MarketplacePage />} />
                <Route path="/music" element={<MusicPage />} />
                <Route path="/film" element={<FilmPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/badges" element={<BadgesPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
        <Lightbox />
      </LightboxProvider>
    </HelmetProvider>
  );
}

export default App;
