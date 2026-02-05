import { useEffect, useState } from 'react';
import NDK, { type NDKEvent, type NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './MarketplacePage.css';
import { useNostr } from '../../context/NostrContext';
import { APP_RELAYS } from '../../utils/relay';

interface Product {
  id: string;
  title: string;
  image: string;
  price: string;
  currency: string;
  description: string;
  category: string;
  event: NDKEvent;
  link: string;
}

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%20viewBox%3D%220%200%20300%20300%22%3E%3Crect%20fill%3D%22%23eee%22%20width%3D%22300%22%20height%3D%22300%22%2F%3E%3Ctext%20fill%3D%22%23aaa%22%20font-family%3D%22sans-serif%22%20font-size%3D%2230%22%20dy%3D%2210.5%22%20font-weight%3D%22bold%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

const CATEGORIES = [
  'All',
  'Bitcoin',
  'Art',
  'Clothing',
  'Food & Drink',
  'Home & Technology',
  'Health & Beauty',
  'Sports & Outside',
  'Services',
  'Books',
  'Pets',
  'Collectibles',
  'Entertainment',
  'Accessories',
  'Shoes',
  'Digital',
  'Physical',
  'Resale',
  'Exchange',
  'Swap',
  'Other',
];

export const MarketplacePage = () => {
  const { ndk: globalNdk } = useNostr();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>('All');

  useEffect(() => {
    if (!globalNdk) return;

    const determineCategory = (event: NDKEvent): string => {
      const tags = event.tags.filter((t) => t[0] === 't').map((t) => t[1]?.toLowerCase());
      const content = (
        event.content +
        (event.tagValue('name') || '') +
        (event.tagValue('title') || '')
      ).toLowerCase();

      const hasTag = (keywords: string[]) =>
        tags.some((t) => keywords.some((k) => t?.includes(k))) ||
        keywords.some((k) => content.includes(k));

      if (
        hasTag([
          'bitcoin',
          'btc',
          'sats',
          'crypto',
          'miner',
          'asic',
          'hardware wallet',
          'signing device',
        ])
      )
        return 'Bitcoin';
      if (hasTag(['art', 'print', 'painting', 'drawing', 'sculpture', 'nft', 'digital', 'poster']))
        return 'Art';
      if (hasTag(['clothing', 'shirt', 'hat', 'hoodie', 'apparel', 'shoes', 'fashion', 'wear']))
        return 'Clothing';
      if (hasTag(['food', 'drink', 'coffee', 'tea', 'beef', 'meat', 'steak', 'wine', 'beer']))
        return 'Food & Drink';
      if (
        hasTag([
          'technology',
          'tech',
          'electronics',
          'computer',
          'phone',
          'gadget',
          'software',
          'hardware',
          'home',
        ])
      )
        return 'Home & Technology';
      if (hasTag(['health', 'beauty', 'soap', 'cosmetic', 'supplement', 'vitamin', 'skin']))
        return 'Health & Beauty';
      if (hasTag(['sports', 'outside', 'outdoor', 'camping', 'hiking', 'gear']))
        return 'Sports & Outside';
      if (hasTag(['service', 'freelance', 'job', 'work', 'consulting', 'design', 'dev']))
        return 'Services';
      if (hasTag(['book', 'ebook', 'reading', 'novel', 'magazine'])) return 'Books';
      if (hasTag(['pet', 'dog', 'cat', 'animal'])) return 'Pets';
      if (hasTag(['collectible', 'rare', 'vintage', 'antique', 'coin'])) return 'Collectibles';
      if (hasTag(['entertainment', 'movie', 'film', 'music', 'game', 'toy']))
        return 'Entertainment';
      if (hasTag(['accessory', 'jewelry', 'bag', 'wallet', 'watch'])) return 'Accessories';
      if (hasTag(['shoe', 'sneaker', 'boot', 'sandal'])) return 'Shoes';
      if (hasTag(['digital', 'code', 'license'])) return 'Digital';
      if (hasTag(['physical'])) return 'Physical';
      if (hasTag(['resale', 'used', 'secondhand'])) return 'Resale';
      if (hasTag(['exchange', 'swap', 'trade'])) return 'Exchange';

      return 'Other';
    };

    // ... parseProductEvent remains the same
    // ... fetchProducts remains the same

    // BUT we need to output the whole block because this tool only supports contiguous replacement.
    // I will replace from CATEGORIES down to the end of useEffect where determineCategory is.
    // Wait, the CATEGORIES constant is outside the component.
    // I will do TWO replacements.
    // 1. Update CATEGORIES and remove filterType state.
    // 2. Remove the filterType dropdown from JSX.
    // I cannot perform multiple edits with replace_file_content in one turn if I need to read the file again properly, but I can use multi_replace.
    // Wait, I can try to do it in one go if I include everything between.
    // That's too much code.
    // I'll update CATEGORIES first.

    const parseProductEvent = (event: NDKEvent): Product | null => {
      try {
        let title = '';
        let description = '';
        let image = '';
        let price = '???';
        let currency = 'SAT';

        // Try parsing content as JSON (NIP-15 Kind 30018)
        let isJson = false;
        try {
          const parsed = JSON.parse(event.content);
          if (parsed && typeof parsed === 'object') {
            isJson = true;
            title = (parsed.name as string) || '';
            description = (parsed.description as string) || '';
            const images = parsed.images as string[] | undefined;
            image = images?.[0] || '';
            price = parsed.price != null ? String(parsed.price) : '???';
            currency = (parsed.currency as string) || 'SAT';
          }
        } catch {
          // Not JSON, continue to check tags (NIP-99 Kind 30402)
        }

        // Fallback or override from tags (NIP-99 or NIP-15 tags)
        if (!title) title = event.tagValue('title') || event.tagValue('name') || '';
        if (!description) description = event.tagValue('summary') || event.content || '';
        if (!image) image = event.tagValue('image') || '';

        // Handle NIP-99 Price Tag ['price', 'amount', 'currency']
        if (!isJson || price === '???') {
          const priceTag = event.tags.find((t) => t[0] === 'price');
          if (priceTag) {
            price = priceTag[1];
            currency = priceTag[2] || 'SAT';
          }
        }

        // ONLY SHOW RESULTS WITH IMAGES
        if (!image || image === PLACEHOLDER_IMAGE) return null;

        if (!title && !description) return null;
        if (!title || title === 'Untitled Product') return null;

        const isAuction = event.kind === 30020;
        const link = isAuction
          ? `https://plebeian.market/auction/${event.id}`
          : `https://plebeian.market/products/${event.id}`;

        const category = determineCategory(event);

        return {
          id: event.id,
          title: title || (isAuction ? 'Auction Item' : 'Untitled Product'),
          image,
          price,
          currency,
          description,
          category,
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
        kinds: [30018, 30020 as number, 30402 as number],
        limit: 100,
      };

      const relaySet = NDKRelaySet.fromRelayUrls(APP_RELAYS.MARKETPLACE, ndk);

      const sub = ndk.subscribe(filter, {
        closeOnEose: false,
        relaySet,
      });

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

      return sub;
    };

    const sub = fetchProducts(globalNdk);
    return () => sub.stop();
  }, [globalNdk]);

  const filteredProducts = products.filter((p) => {
    if (filterCategory !== 'All') {
      return p.category === filterCategory;
    }
    return true;
  });

  return (
    <div className="marketplace-container">
      <div className="marketplace-wrapper">
        <Navbar />

        <div className="marketplace-content">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '15px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <h2
              className="section-header"
              style={{ marginBottom: 0, border: 'none', background: 'none', padding: 0 }}
            >
              Community Marketplace
            </h2>

            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="marketplace-filter-select"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ borderBottom: '1px solid #000', marginBottom: '15px' }}></div>

          {loading && products.length === 0 ? (
            <div className="loading-spiral">Loading latest wares...</div>
          ) : (
            <div className="marketplace-grid">
              {filteredProducts.map((product) => (
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
                        e.currentTarget.src = PLACEHOLDER_IMAGE;
                      }}
                    />
                  </div>
                  <div className="product-info">
                    <div className="product-title">{product.title}</div>
                    <div className="product-price">
                      {product.price} {product.currency}
                    </div>
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
                {selectedProduct.category !== 'Other' && (
                  <div style={{ marginBottom: '10px', fontStyle: 'italic', fontSize: '12px' }}>
                    Category: {selectedProduct.category}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <a
                    href={selectedProduct.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="buy-button"
                  >
                    {selectedProduct.event.kind === 30020 ? 'Bid on Plebeian' : 'Buy on Plebeian'}
                  </a>
                  <a
                    href={`https://shopstr.store/listing/${selectedProduct.event.encode()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shopstr-button"
                  >
                    View on Shopstr
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
