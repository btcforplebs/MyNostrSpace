import { useState, useEffect } from 'react';
import { useNostr } from '../../context/NostrContext';
import { Navbar } from '../Shared/Navbar';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { getBlossomServers } from '../../services/blossom';
import { isOnion, APP_RELAYS } from '../../utils/relay';

export const SettingsPage = () => {
  const { relays, updateRelays, ndk, user } = useNostr();
  const [newRelay, setNewRelay] = useState('');
  const [blossomServers, setBlossomServers] = useState<string[]>([]);
  const [newBlossomServer, setNewBlossomServer] = useState('');
  const [isSavingBlossom, setIsSavingBlossom] = useState(false);

  // Fetch Blossom Servers on mount
  useEffect(() => {
    if (!ndk || !user) return;
    getBlossomServers(ndk, user.pubkey).then(setBlossomServers);
  }, [ndk, user]);

  const handleAddRelay = () => {
    if (!newRelay) return;
    let url = newRelay.trim();
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      url = 'wss://' + url;
    }

    if (isOnion(url)) {
      alert('Onion relays are not supported for performance reasons.');
      return;
    }

    if (relays.includes(url)) {
      alert('Relay already in list');
      return;
    }

    const updated = [...relays, url];
    updateRelays(updated);
    setNewRelay('');
  };

  const handleRemoveRelay = (url: string) => {
    if (confirm(`Remove ${url}? You may need to refresh the page for this to take full effect.`)) {
      const updated = relays.filter((r) => r !== url);
      updateRelays(updated);
    }
  };

  const handleResetRelays = () => {
    if (confirm('Reset to default relays?')) {
      updateRelays(APP_RELAYS.DEFAULT);
    }
  };

  const handleAddBlossom = () => {
    if (!newBlossomServer) return;
    let url = newBlossomServer.trim();
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      url = 'https://' + url;
    }
    if (url.endsWith('/')) url = url.slice(0, -1);

    if (blossomServers.includes(url)) {
      alert('Server already in list');
      return;
    }

    setBlossomServers([...blossomServers, url]);
    setNewBlossomServer('');
  };

  const handleRemoveBlossom = (url: string) => {
    setBlossomServers(blossomServers.filter((s) => s !== url));
  };

  const saveBlossomServers = async () => {
    if (!ndk || !user) return;
    setIsSavingBlossom(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = 10063 as NDKKind;
      event.content = '';
      event.tags = blossomServers.map((s) => ['server', s]);
      await event.publish();
      alert('Blossom servers saved to your profile!');
    } catch (error) {
      console.error('Failed to save Blossom servers:', error);
      alert('Failed to save servers: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSavingBlossom(false);
    }
  };

  return (
    <div className="settings-page-container">
      <Navbar />
      <div className="settings-content">
        <h2 style={{ color: '#6699cc' }}>Settings</h2>

        {/* Relay Section */}
        <div className="settings-section">
          <h3 style={{ color: '#333' }}>Relay Configuration</h3>
          <p className="section-desc">
            Manage the relays you connect to. These help you find profiles and events.
          </p>
          <div className="settings-box">
            <div className="add-item-box">
              <input
                type="text"
                placeholder="wss://relay.example.com"
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRelay()}
                style={{ color: 'black', background: 'white' }}
              />
              <button onClick={handleAddRelay}>Add Relay</button>
            </div>
            <div className="item-list">
              {Array.from(new Set(relays)).map((url) => (
                <div key={url} className="item-row">
                  <span className="item-url" style={{ color: '#333' }}>
                    {url}
                  </span>
                  <button className="remove-btn" onClick={() => handleRemoveRelay(url)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="reset-section">
              <button className="reset-btn" onClick={handleResetRelays}>
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Blossom Section */}
        <div className="settings-section" style={{ marginTop: '30px' }}>
          <h3 style={{ color: '#333' }}>Blossom Media Servers</h3>
          <p className="section-desc">
            Identify servers where you store your media (Kind 10063). This app uses these for your
            uploads.
          </p>
          <div className="settings-box">
            <div className="add-item-box">
              <input
                type="text"
                placeholder="https://blossom.example.com"
                value={newBlossomServer}
                onChange={(e) => setNewBlossomServer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBlossom()}
                style={{ color: 'black', background: 'white' }}
              />
              <button onClick={handleAddBlossom}>Add Server</button>
            </div>
            <div className="item-list">
              {blossomServers.length === 0 ? (
                <div style={{ padding: '10px', color: '#888', fontStyle: 'italic' }}>
                  No servers configured. Using defaults.
                </div>
              ) : (
                Array.from(new Set(blossomServers)).map((url) => (
                  <div key={url} className="item-row">
                    <span className="item-url" style={{ color: '#333' }}>
                      {url}
                    </span>
                    <button className="remove-btn" onClick={() => handleRemoveBlossom(url)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="save-section" style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                className="save-btn"
                onClick={saveBlossomServers}
                disabled={isSavingBlossom}
                style={{
                  background: '#6699cc',
                  color: 'white',
                  border: 'none',
                  padding: '5px 15px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {isSavingBlossom ? 'Saving...' : 'Save Blossom List to Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
                .settings-page-container {
                    max-width: 800px;
                    margin: 0 auto;
                    font-family: Arial, Helvetica, sans-serif;
                }
                .settings-content {
                    background: #fff;
                    padding: 20px;
                    border: 1px solid #ccc;
                    margin-top: 10px;
                }
                .settings-content h2 {
                    margin-top: 0;
                    border-bottom: 2px solid #6699cc;
                    padding-bottom: 5px;
                    color: #6699cc;
                }
                .settings-section h3 {
                    margin-bottom: 5px;
                    color: #333;
                }
                .section-desc {
                    font-size: 9pt;
                    color: #666;
                    margin-bottom: 15px;
                }
                .settings-box {
                    background: #f9f9f9;
                    padding: 15px;
                    border: 1px solid #ddd;
                }
                .add-item-box {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }
                .add-item-box input {
                    flex: 1;
                    padding: 8px;
                    border: 1px solid #ccc;
                    font-family: monospace;
                }
                .add-item-box button {
                    padding: 5px 15px;
                    background: #6699cc;
                    color: white;
                    border: none;
                    cursor: pointer;
                }
                .item-list {
                    background: white;
                    border: 1px solid #eee;
                    max-height: 250px;
                    overflow-y: auto;
                }
                .item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    border-bottom: 1px solid #f0f0f0;
                }
                .item-row:last-child {
                    border-bottom: none;
                }
                .item-url {
                    font-family: monospace;
                    font-size: 9pt;
                }
                .remove-btn {
                    background: #fee;
                    color: #c33;
                    border: 1px solid #c33;
                    font-size: 8pt;
                    padding: 2px 6px;
                    cursor: pointer;
                }
                .reset-section {
                    margin-top: 15px;
                    text-align: right;
                }
                .reset-btn {
                    background: #eee;
                    border: 1px solid #ccc;
                    font-size: 8pt;
                    padding: 3px 10px;
                    cursor: pointer;
                }
                .save-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
    </div>
  );
};
