import { useState } from 'react';
import { useNostr } from '../../context/NostrContext';
import { uploadToBlossom } from '../../services/blossom';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';

const DEFAULT_CSS = `/* Custom Profile CSS */
body {
  background-color: #e5e5e5;
}
.profile-container, .home-content {
  background-color: white;
}
`;

const THEME_PRESETS = {
  classic: DEFAULT_CSS,
  matrix: `/* Matrix Digital Rain */
body { 
    background-color: #000 !important; 
    color: #00ff41 !important;
    font-family: 'Courier New', Courier, monospace !important;
    background-image: none !important;
}
.profile-container, .home-content { 
    background-color: #000 !important; 
    border: 1px solid #00ff41 !important; 
    box-shadow: 0 0 10px #003b00;
}
.home-box, .status-mood-box, .blurb-content, .top-8-section {
    border: 1px solid #003b00 !important;
    background: #000 !important;
}
.home-box-header, .status-mood-header, .section-header {
    background-color: #003b00 !important;
    color: #00ff41 !important;
    border-bottom: 1px solid #00ff41 !important;
}
a { color: #00ff41 !important; text-transform: uppercase; letter-spacing: 1px; }
a:hover { color: #fff !important; text-shadow: 0 0 5px #00ff41; }
* { border-color: #003b00 !important; }
`,
  y2k: `/* Y2K Glitter / Pop */
body { 
    background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%) !important;
    background-attachment: fixed !important;
}
.profile-container, .home-content { 
    background-color: rgba(255, 255, 255, 0.9) !important; 
    border: 1px solid #ff00ff !important; 
    border-radius: 20px;
    padding: 20px;
}
.home-box-header, .status-mood-header, .section-header {
    background: linear-gradient(90deg, #ff00ff, #00ffff) !important;
    color: #fff !important;
    border-radius: 10px;
    text-shadow: 1px 1px 2px #000;
}
a { color: #ff00ff !important; font-weight: bold; }
.home-box { border-radius: 15px; overflow: hidden; border: 2px solid #fecfef !important; }
`,
  emo: `/* Emo / Scene Night */
body { 
    background: #000 url('https://www.transparenttextures.com/patterns/carbon-fibre.png') !important;
}
.profile-container, .home-content { 
    background-color: #000 !important; 
    border: 1px solid #cc0000 !important; 
    color: #fff !important;
}
.home-box, .status-mood-box {
    background: #111 !important;
    border: 1px solid #cc0000 !important;
}
.home-box-header, .status-mood-header, .section-header {
    background-color: #cc0000 !important;
    color: #000 !important;
    font-family: 'Arial Black', Gadget, sans-serif;
    text-transform: uppercase;
}
a { color: #ff0000 !important; text-decoration: underline !important; }
a:hover { background: #cc0000; color: #000; }
`,
  geocities: `/* 1996 Time Machine */
body { 
    background: #000080 url('https://www.transparenttextures.com/patterns/stardust.png') !important;
}
.profile-container, .home-content { 
    background-color: #bfbfbf !important; 
    border: 1px double #fff !important; 
    color: #000 !important;
    font-family: "Times New Roman", Times, serif !important;
}
.home-box-header, .status-mood-header, .section-header {
    background: linear-gradient(90deg, #000080, #0000ff) !important;
    color: #ffff00 !important;
    padding: 10px !important;
}
.home-box { border: 1px inset #fff !important; background: #bfbfbf !important; }
a { color: #0000ee !important; font-weight: bold; }
a:visited { color: #551a8b !important; }
`,
  cyberpunk: `/* Cyberpunk 2077 Night */
body { 
    background: #fcee0a !important; 
}
.profile-container, .home-content { 
    background-color: #000 !important; 
    border-left: 1px solid #fcee0a !important;
    border-right: 1px solid #00ffff !important;
    color: #fcee0a !important;
    clip-path: polygon(0% 0%, 100% 0%, 100% 95%, 95% 100%, 0% 100%);
}
.home-box-header, .status-mood-header, .section-header {
    background-color: #fcee0a !important;
    color: #000 !important;
    skew: -10deg;
}
.home-box { border: 1px solid #00ffff !important; background: #111 !important; margin: 10px; }
a { color: #00ffff !important; text-transform: lowercase; font-style: italic; }
`,
};

export const LayoutEditor = () => {
  const { ndk, user, login } = useNostr();
  const [code, setCode] = useState(DEFAULT_CSS);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ndk) return;

    setUploading(true);
    setStatus('Uploading background image...');

    try {
      // Determine best server. Defaulting to one for now.
      // Ideally we check NIP-65 or use a discovered one.
      const server = 'https://nostr.build';
      const result = await uploadToBlossom(ndk, file, server);

      setStatus('Image uploaded! Appending CSS.');

      const imageUrl = result.url;
      const bgCss = `\n/* Background Image */\nbody {\n  background-image: url('${imageUrl}');\n  background-attachment: fixed;\n  background-repeat: repeat;\n}\n`;

      setCode((prev) => prev + bgCss);
      setUploading(false);
    } catch (err: any) {
      console.error(err);
      setStatus(`Upload failed: ${err.message}`);
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!ndk || !user) {
      login();
      return;
    }
    setStatus('Saving layout...');

    try {
      // Publish Kind 30078 event with the CSS content directly for simplicity
      // (Blossom plan mentioned storing URL, but storing CSS (Kind 30001 or 30078) is faster for edits)
      // Let's stick to Kind 30078 'mynostrspace_layout'

      // We can also upload the CSS file itself to Blossom + store URL (as per original plan)
      // BUT, direct storage is much snappier for this editor.
      // Let's provide BOTH: Upload CSS file to blossom (robust) OR direct.
      // Direct text in an event is limited by relay size (64kb usually fine for CSS).
      // Let's use direct text for MVP seamlessness.

      const event = new NDKEvent(ndk);
      event.kind = 30078 as NDKKind;
      event.content = code;
      event.tags = [
        ['d', 'mynostrspace_layout'],
        ['t', 'css'],
        ['alt', 'MyNostrSpace Custom Layout'],
      ];

      await event.publish();
      setStatus('Layout saved successfully! Go check your profile.');
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
    }
  };

  if (!user) {
    return (
      <div className="layout-editor-container">
        <Navbar />
        <div style={{ padding: 20, textAlign: 'center' }}>
          <h2>Please Login</h2>
          <button onClick={login}>Login to Customize</button>
        </div>
      </div>
    );
  }

  return (
    <div className="layout-editor-container">
      <Navbar />
      <div className="editor-wrapper">
        <h2>Customize Your Space</h2>
        <p>
          Write standard CSS to override the default styles. Upload an image to automatically add it
          as a background.
        </p>

        <div className="toolbar">
          <label className="upload-btn">
            {uploading ? 'Uploading...' : 'Upload Background Image'}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          <div className="theme-presets">
            <select
              onChange={(e) => {
                const selected = THEME_PRESETS[e.target.value as keyof typeof THEME_PRESETS];
                if (selected) setCode(selected);
              }}
              style={{ padding: '5px', fontSize: '9pt' }}
            >
              <option value="">-- Select a Full Page Theme --</option>
              <option value="classic">Classic MySpace</option>
              <option value="matrix">Matrix Code</option>
              <option value="y2k">Y2K Glitter</option>
              <option value="emo">Emo/Scene Night</option>
              <option value="geocities">1996 GeoCities</option>
              <option value="cyberpunk">Cyberpunk 2077</option>
            </select>
          </div>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="css-editor"
          spellCheck={false}
        />

        <div className="actions">
          <button onClick={handleSave} className="save-btn">
            Save Layout
          </button>
          <span className="status-msg">{status}</span>
        </div>
      </div>

      <style>{`
                .layout-editor-container {
                    width: 800px;
                    margin: 0 auto;
                    background: #fff;
                    min-height: 100vh;
                    border: 1px solid #ccc;
                }
                .editor-wrapper {
                    padding: 20px;
                }
                .toolbar {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    margin-bottom: 15px;
                    background: #f5f5f5;
                    padding: 10px;
                    border: 1px solid #ddd;
                }
                .css-editor {
                    width: 100%;
                    height: 400px;
                    font-family: monospace;
                    background: #222;
                    color: #0f0;
                    padding: 10px;
                    border: 1px solid #999;
                    margin: 10px 0;
                }
                .upload-btn {
                    display: inline-block;
                    padding: 5px 10px;
                    background: #6699cc;
                    color: white;
                    cursor: pointer;
                    font-weight: bold;
                    border: 1px solid #000;
                }
                .save-btn {
                    padding: 10px 20px;
                    background: #ff9933;
                    font-weight: bold;
                    cursor: pointer;
                    border: 2px solid #000;
                }
                .status-msg {
                    margin-left: 10px;
                    font-weight: bold;
                }
            `}</style>
    </div>
  );
};
