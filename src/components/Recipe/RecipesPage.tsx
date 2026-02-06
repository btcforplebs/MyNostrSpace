import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKSubscriptionCacheUsage, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { useProfile } from '../../hooks/useProfile';
import './RecipesPage.css';

interface Recipe {
  id: string;
  pubkey: string;
  title: string;
  image?: string;
  summary?: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  prepTime?: string;
  cookTime?: string;
  servings?: string;
  created_at: number;
  event: NDKEvent;
}

// Sub-component to handle author fetching and display
const RecipeAuthor = memo(({ pubkey, className }: { pubkey: string; className?: string }) => {
  const { profile, loading } = useProfile(pubkey);

  const displayName = profile?.displayName || profile?.name || profile?.nip05 || pubkey.slice(0, 8);

  if (loading && !profile) {
    return <span className={className}>Loading...</span>;
  }

  return (
    <Link to={`/p/${pubkey}`} className={className} onClick={(e) => e.stopPropagation()}>
      By: {displayName}
    </Link>
  );
});

// Simple wrapper for author link without "By:" prefix for other contexts if needed
const AuthorLink = memo(({ pubkey }: { pubkey: string }) => {
  const { profile } = useProfile(pubkey);
  const displayName = profile?.displayName || profile?.name || profile?.nip05 || pubkey.slice(0, 8);

  return (
    <Link to={`/p/${pubkey}`} onClick={(e) => e.stopPropagation()}>
      {displayName}
    </Link>
  );
});

export const RecipesPage = () => {
  const { ndk, user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const recipeBufferRef = useRef<Recipe[]>([]);
  const isUpdatePendingRef = useRef(false);
  const fetchingRef = useRef(false);
  const loadTrackerRef = useRef(0);

  const processBuffer = useCallback(() => {
    if (recipeBufferRef.current.length === 0) return;

    setRecipes((prev) => {
      const next = [...prev];
      let changed = false;

      for (const recipe of recipeBufferRef.current) {
        if (!next.find((r) => r.id === recipe.id)) {
          next.push(recipe);
          changed = true;
        }
      }

      recipeBufferRef.current = [];
      isUpdatePendingRef.current = false;

      if (!changed) return prev;
      return next.sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  const handleEvent = useCallback(
    (event: NDKEvent) => {
      // Parse ingredients (i tags)
      const ingredients = event.tags.filter((t) => t[0] === 'i').map((t) => t[1]);

      // Parse steps (step tags) - sometimes they preserve order
      const steps = event.tags.filter((t) => t[0] === 'step').map((t) => t[1]);

      // Parse metadata
      const title = event.tags.find((t) => t[0] === 'title')?.[1] || 'Untitled Recipe';
      const image = event.tags.find((t) => t[0] === 'image')?.[1];
      const summary = event.tags.find((t) => t[0] === 'summary')?.[1] || event.content;
      const prepTime = event.tags.find((t) => t[0] === 'preptime')?.[1];
      const cookTime = event.tags.find((t) => t[0] === 'cooktime')?.[1];
      const servings = event.tags.find((t) => t[0] === 'servings')?.[1];

      const tags = event.tags.filter((t) => t[0] === 't').map((t) => t[1]);

      const recipe: Recipe = {
        id: event.id,
        pubkey: event.pubkey,
        title,
        image,
        summary,
        ingredients,
        steps,
        tags,
        prepTime,
        cookTime,
        servings,
        created_at: event.created_at || 0,
        event,
      };

      if (loadingMore) {
        loadTrackerRef.current++;
      }

      recipeBufferRef.current.push(recipe);
      if (!isUpdatePendingRef.current) {
        isUpdatePendingRef.current = true;
        setTimeout(processBuffer, 300);
      }
    },
    [loadingMore, processBuffer]
  );

  useEffect(() => {
    if (!ndk) return;

    setLoading(true);

    const filter: NDKFilter = {
      kinds: [30023 as number],
      '#t': ['zapcooking', 'nostrcooking'],
      limit: 50,
    };

    const sub = ndk.subscribe(filter, {
      closeOnEose: false, // Keep subscription open for new events
      cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
    });

    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoading(false);
      processBuffer();
      console.log('Recipes Page: Initial fetch complete');
    });

    return () => {
      sub.stop();
    };
  }, [ndk, handleEvent, processBuffer]);

  const handleLoadMore = useCallback(async () => {
    if (!ndk || recipes.length === 0 || loadingMore || fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    loadTrackerRef.current = 0;

    const oldestTimestamp = Math.min(...recipes.map((r) => r.created_at));

    const filter: NDKFilter = {
      kinds: [30023 as number],
      '#t': ['zapcooking', 'nostrcooking'],
      until: oldestTimestamp - 1,
      limit: 50,
    };

    const sub = ndk.subscribe(filter, { closeOnEose: true });
    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoadingMore(false);
      fetchingRef.current = false;
      processBuffer();

      if (loadTrackerRef.current === 0) {
        setHasMore(false);
      }
    });
  }, [ndk, recipes, loadingMore, hasMore, handleEvent, processBuffer]);

  // Infinite Scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollBottom = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 800;

      if (
        scrollBottom >= threshold &&
        !fetchingRef.current &&
        recipes.length > 0 &&
        !loadingMore &&
        hasMore
      ) {
        handleLoadMore();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [recipes.length, loadingMore, hasMore, handleLoadMore]);

  return (
    <div className="home-page-container rp-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO
        title="Nostr Recipes"
        description="Discover delicious recipes shared by the Nostr community."
      />

      <div className="home-wrapper rp-wrapper">
        <Navbar />

        <div className="home-content rp-content">
          <h2 className="rp-section-header">
            <span className="rp-header-icon">🍳</span> Latest Recipes from Nostr
          </h2>

          {loading && recipes.length === 0 ? (
            <div className="rp-loading-state">
              <div className="rp-spinner"></div>
              <p>Cooking up some results...</p>
            </div>
          ) : (
            <>
              <div className="rp-recipes-grid">
                {recipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="rp-recipe-card"
                    onClick={() => setSelectedRecipe(recipe)}
                  >
                    <div className="rp-thumbnail-container">
                      {recipe.image ? (
                        <img
                          src={recipe.image}
                          alt={recipe.title}
                          className="rp-recipe-thumbnail"
                          loading="lazy"
                        />
                      ) : (
                        <div className="rp-recipe-placeholder">
                          <span className="rp-placeholder-icon">🍲</span>
                        </div>
                      )}
                      <div className="rp-badge">{recipe.tags[0] || 'Recipe'}</div>
                      {(recipe.prepTime || recipe.cookTime) && (
                        <div className="rp-time-badge">
                          ⏱ {recipe.prepTime || recipe.cookTime || ''}
                        </div>
                      )}
                    </div>
                    <div className="rp-recipe-info">
                      <div className="rp-recipe-title" title={recipe.title}>
                        {recipe.title}
                      </div>
                      <div className="rp-recipe-summary">{recipe.summary}</div>
                      <div className="rp-tags">
                        {recipe.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="rp-tag">
                            #{tag}
                          </span>
                        ))}
                      </div>

                      <div className="rp-recipe-meta">
                        <RecipeAuthor pubkey={recipe.pubkey} className="rp-recipe-author" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {loadingMore && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                  Loading more tasty recipes...
                </div>
              )}

              {!loadingMore && hasMore && recipes.length > 0 && (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <button
                    onClick={handleLoadMore}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#fff',
                      background: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                    }}
                  >
                    Load More Recipes
                  </button>
                </div>
              )}
            </>
          )}

          {!loading && recipes.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              No recipes found. Try adding more relays!
            </div>
          )}
        </div>
      </div>

      {selectedRecipe && (
        <div className="rp-modal-overlay" onClick={() => setSelectedRecipe(null)}>
          <div className="rp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-header">
              <h3 className="rp-modal-title">{selectedRecipe.title}</h3>
              <button className="rp-close-btn" onClick={() => setSelectedRecipe(null)}>
                ×
              </button>
            </div>

            <div className="rp-modal-scroll">
              <div className="rp-detail-header">
                {selectedRecipe.image && (
                  <div className="rp-detail-image-container">
                    <img
                      src={selectedRecipe.image}
                      alt={selectedRecipe.title}
                      className="rp-detail-image"
                    />
                  </div>
                )}

                <div className="rp-detail-meta">
                  <div className="rp-meta-item">
                    👤 <AuthorLink pubkey={selectedRecipe.pubkey} />
                  </div>
                  {selectedRecipe.prepTime && (
                    <div className="rp-meta-item">🔪 Prep: {selectedRecipe.prepTime}</div>
                  )}
                  {selectedRecipe.cookTime && (
                    <div className="rp-meta-item">🍳 Cook: {selectedRecipe.cookTime}</div>
                  )}
                  {selectedRecipe.servings && (
                    <div className="rp-meta-item">🍽 Servings: {selectedRecipe.servings}</div>
                  )}
                </div>

                {/* Description/Summary Block */}
                {selectedRecipe.summary && (
                  <div className="rp-description">{selectedRecipe.summary}</div>
                )}
              </div>

              <div className="rp-recipe-content">
                {/* Main Content (Markdown) */}
                <div className="rp-markdown-content" style={{ marginBottom: '2rem' }}>
                  <RichTextRenderer
                    content={
                      selectedRecipe.ingredients.length === 0 && selectedRecipe.steps.length === 0
                        ? selectedRecipe.event.content
                        : ''
                    }
                    style={{ fontSize: '1.1rem', lineHeight: '1.6' }}
                  />
                  {/* Fallback to just rendering content if tags missing, handled by logic above effectively */}
                  {/* Actually, let's just always render content since 30023 is content-heavy */}
                  <RichTextRenderer content={selectedRecipe.event.content} />
                </div>

                {/* Legacy/Tag-based Ingredients (if available) - optional to keep showing if they exist */}
                {selectedRecipe.ingredients.length > 0 && (
                  <div className="rp-ingredients-section">
                    <h4 className="rp-section-title">Ingredients (Tags)</h4>
                    <ul className="rp-ingredients-list">
                      {selectedRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="rp-ingredient-item">
                          <span className="rp-ingredient-bullet">•</span> {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Legacy/Tag-based Steps (if available) */}
                {selectedRecipe.steps.length > 0 && (
                  <div className="rp-steps-section">
                    <h4 className="rp-section-title">Directions (Tags)</h4>
                    <ol className="rp-steps-list">
                      {selectedRecipe.steps.map((step, i) => (
                        <li key={i} className="rp-step-item">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
