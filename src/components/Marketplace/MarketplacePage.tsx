import { useEffect, useState, useRef } from 'react';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import NDK, { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './MarketplacePage.css';

interface Product {
  id: string;
  title: string;
  image: string;
  price: string;
  currency: string;
  description: string;
  event: NDKEvent;
  link: string;
}

const MARKETPLACE_RELAYS = ['wss://relay.shopstr.store', 'wss://relay.damus.io', 'wss://nos.lol'];

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%20viewBox%3D%220%200%20300%20300%22%3E%3Crect%20fill%3D%22%23eee%22%20width%3D%22300%22%20height%3D%22300%22%2F%3E%3Ctext%20fill%3D%22%23aaa%22%20font-family%3D%22sans-serif%22%20font-size%3D%2230%22%20dy%3D%2210.5%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

export const MarketplacePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const ndkRef = useRef<NDK | null>(null);

  useEffect(() => {
    const parseProductEvent = (event: NDKEvent): Product | null => {
      try {
        // NIP-15: kind 30018 product events store data as JSON in content
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(event.content);
        } catch {
          // Content isn't valid JSON — skip this event
          return null;
        }

        if (!parsed || typeof parsed !== 'object') return null;

        const title =
          (parsed.name as string) ||
          event.tagValue('title') ||
          event.tagValue('name') ||
          '';
        const description = (parsed.description as string) || event.tagValue('summary') || '';

        // NIP-15 images field is an array of URLs
        const images = parsed.images as string[] | undefined;
        const image = images?.[0] || event.tagValue('image') || PLACEHOLDER_IMAGE;

        // NIP-15 price/currency are top-level fields in the JSON
        const price = parsed.price != null ? String(parsed.price) : '???';
        const currency = (parsed.currency as string) || 'SAT';

        // Filter out low-quality listings
        if (!title && !description) return null;
        if (!title || title === 'Untitled Product') return null;
        if (image === PLACEHOLDER_IMAGE && !description) return null;

        const link = `https://shopstr.store/details/${event.encode()}`;

        return {
          id: event.id,
          title: title || 'Untitled Product',
          image,
          price,
          currency,
          description,
          event,
          link,
        };
      } catch (e) {
        console.warn('Failed to parse product:', e);
        return null;
      }
    };

    const fetchProducts = (ndk: NDK) => {
      const filter: NDKFilter = {
        kinds: [30018], // Kind 30018: Products
        limit: 100, // Fetch a good amount
      };

      // Create a relay set explicitly to avoid deprecation warning
      const relaySet = NDKRelaySet.fromRelayUrls(MARKETPLACE_RELAYS, ndk);

      const sub = ndk.subscribe(filter, {
        closeOnEose: false,
        relaySet, // Pass relaySet here
      });

      // Batch updates
      let eventBuffer: Product[] = [];
      let isUpdatePending = false;

      const flushBuffer = () => {
        if (eventBuffer.length === 0) return;

        setProducts((prev) => {
          const newProducts = [...prev];
          const seenIds = new Set(prev.map((p) => p.id));

          let added = false;
          for (const product of eventBuffer) {
            if (!seenIds.has(product.id)) {
              newProducts.push(product);
              seenIds.add(product.id);
              added = true;
            }
          }

          if (!added) return prev;

          return newProducts.sort((a, b) => {
            return (b.event.created_at || 0) - (a.event.created_at || 0);
          });
        });

        eventBuffer = [];
        isUpdatePending = false;
      };

      sub.on('event', (event: NDKEvent) => {
        const product = parseProductEvent(event);
        if (product) {
          eventBuffer.push(product);
          if (!isUpdatePending) {
            isUpdatePending = true;
            setTimeout(flushBuffer, 500);
          }
        }
      });

      sub.on('eose', () => {
        flushBuffer();
        setLoading(false);
      });
    };

    const initNDK = async () => {
      // Connect to explicit relays, but don't fail hard if one fails
      const ndk = new NDK({ explicitRelayUrls: MARKETPLACE_RELAYS });
      ndkRef.current = ndk;

      try {
        await ndk.connect(2000); // Wait up to 2s for connections
      } catch (e) {
        console.warn('Some relays failed to connect', e);
      }

      fetchProducts(ndk);
    };

    if (!ndkRef.current) {
      initNDK();
    }
  }, []);

  return (
    <div className="marketplace-container">
      <div className="marketplace-wrapper">
        <div>
          <Navbar />
        </div>

        <div className="marketplace-content">
          <h2 className="section-header">Community Marketplace</h2>

          {loading && products.length === 0 ? (
            <div className="loading-spiral">Loading latest wares...</div>
          ) : (
            <div className="marketplace-grid">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="product-card"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="product-image-wrapper">
                    <img
                      src={product.image}
                      alt={product.title}
                      className="product-image"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = PLACEHOLDER_IMAGE; // Use local data URI fallback
                      }}
                    />
                  </div>
                  <div className="product-info">
                    <div className="product-title">{product.title}</div>
                    <div className="product-price">
                      {product.price} {product.currency}
                    </div>
                    {/* <div className="product-description">{product.description}</div> */}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedProduct && (
        <div className="marketplace-modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="marketplace-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="marketplace-modal-header">
              <h3>{selectedProduct.title}</h3>
              <button className="close-modal-btn" onClick={() => setSelectedProduct(null)}>
                ×
              </button>
            </div>
            <div className="marketplace-modal-body">
              <div className="modal-image-container">
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.title}
                  className="modal-image"
                />
              </div>
              <div className="modal-details">
                <div className="modal-price">
                  {selectedProduct.price} {selectedProduct.currency}
                </div>
                <div className="modal-description">{selectedProduct.description}</div>

                <a
                  href={selectedProduct.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="buy-button"
                >
                  View on Shopstr
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
