import { useState } from 'react';
import { useNostr } from '../../context/NostrContext';
import { Navbar } from '../Shared/Navbar';

export const RelaySettings = () => {
  const { relays, updateRelays } = useNostr();
  const [newRelay, setNewRelay] = useState('');

  const handleAdd = () => {
    if (!newRelay) return;
    let url = newRelay.trim();
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      url = 'wss://' + url;
    }

    if (relays.includes(url)) {
      alert('Relay already in list');
      return;
    }

    const updated = [...relays, url];
    updateRelays(updated);
    setNewRelay('');
  };

  const handleRemove = (url: string) => {
    if (confirm(`Remove ${url}? You may need to refresh the page for this to take full effect.`)) {
      const updated = relays.filter((r) => r !== url);
      updateRelays(updated);
    }
  };

  const handleReset = () => {
    if (confirm('Reset to default relays?')) {
      const DEFAULT_RELAYS = [
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://relay.nostr.band',
        'wss://nos.lol',
      ];
      updateRelays(DEFAULT_RELAYS);
    }
  };

  return (
    <div className="relay-settings-container">
      <Navbar />
      <div className="settings-content">
        <h2>Relay Configuration</h2>

        <div className="settings-box">
          <p>Manage the relays you connect to. These help you find profiles and events.</p>

          <div className="add-relay-box">
            <input
              type="text"
              placeholder="wss://relay.example.com"
              value={newRelay}
              onChange={(e) => setNewRelay(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd}>Add Relay</button>
          </div>

          <div className="relay-list">
            {relays.map((url) => (
              <div key={url} className="relay-item">
                <span className="relay-url">{url}</span>
                <button className="remove-btn" onClick={() => handleRemove(url)}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="reset-section">
            <button className="reset-btn" onClick={handleReset}>
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>

      <style>{`
                .relay-settings-container {
                    max-width: 800px;
                    margin: 0 auto;
                    font-family: Arial, Helvetica, sans-serif;
                }
                .settings-content {
                    background: #fff;
                    padding: 20px;
                    border: 1px solid #ccc;
                    margin-top: 10px;
                    color: black;
                }
                .settings-content h2 {
                    margin-top: 0;
                    border-bottom: 1px solid #6699cc;
                    padding-bottom: 5px;
                    color: #6699cc;
                }
                .settings-box {
                    background: #f5f5f5;
                    padding: 15px;
                    border: 1px solid #ddd;
                    color: black;
                }
                .add-relay-box {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid #ccc;
                    color: black;
                }
                .add-relay-box input {
                    flex: 1;
                    padding: 5px;
                    font-family: monospace;
                    color: black;
                    background: white;
                    border: 1px solid #999;
                }
                .relay-list {
                    background: white;
                    border: 1px solid #ccc;
                    padding: 5px;
                    max-height: 400px;
                    overflow-y: auto;
                    color: black;
                }
                .relay-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px;
                    border-bottom: 1px solid #eee;
                    color: black;
                }
                .relay-item:last-child {
                    border-bottom: none;
                }
                .relay-url {
                    font-family: monospace;
                    font-size: 10pt;
                    color: black;
                }
                .remove-btn {
                    background: #ffcccc;
                    color: #cc0000;
                    border: 1px solid #cc0000;
                    padding: 2px 8px;
                    font-size: 8pt;
                    cursor: pointer;
                }
                .reset-section {
                    margin-top: 20px;
                    text-align: right;
                }
                .reset-btn {
                    background: #eee;
                    border: 1px solid #999;
                    font-size: 9pt;
                }
            `}</style>
    </div>
  );
};
