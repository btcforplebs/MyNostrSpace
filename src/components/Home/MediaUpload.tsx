import React, { useState, useRef } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';
import { uploadToBlossom } from '../../services/blossom';
import './MediaUpload.css';

interface MediaUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
  type: 'photo' | 'video';
  mood?: string;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
  type,
  mood = 'None',
}) => {
  const { ndk, user } = useNostr();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const calculateSha256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleUpload = async () => {
    if (!file || !ndk || !user) return;
    setIsUploading(true);

    try {
      // 1. Upload to Blossom
      console.log('Uploading to Blossom...');
      const response = await uploadToBlossom(ndk, file);
      const url = response.url;

      // 2. Get file metadata
      const sha256 = await calculateSha256(file);

      // 3. Create Kind 1063 (File Metadata) event
      const event = new NDKEvent(ndk);
      event.kind = 1063;
      event.content = description;
      event.tags = [
        ['url', url],
        ['m', file.type],
        ['x', sha256],
        ['size', file.size.toString()],
        [
          'alt',
          description ||
            (type === 'photo'
              ? 'A photo shared on MyNostrSpace'
              : 'A video shared on MyNostrSpace'),
        ],
        ['client', 'MyNostrSpace'],
      ];

      // If it's a photo, maybe add dimensions (kind of hard without loading the image first)
      // For now, these basic tags are enough for Kind 1063.

      console.log('Publishing Kind 1063 event...');
      await event.publish();

      // 4. Create Kind 1 (Text Note) event so it appears in the feed
      console.log('Publishing Kind 1 note...');
      const noteEvent = new NDKEvent(ndk);
      noteEvent.kind = 1;

      let noteContent = description;
      if (mood && mood !== 'None') {
        noteContent = `Mood: ${mood}\n\n${noteContent}`;
        noteEvent.tags.push(['mood', mood]);
      }

      // Append URL to content for visualization in other clients
      noteEvent.content = noteContent ? `${noteContent}\n\n${url}` : url;
      noteEvent.tags.push(['client', 'MyNostrSpace']);

      // Link to the media event - REMOVED because it causes the homepage feed to filter it out as a "reply"
      // noteEvent.tags.push(['e', event.id]);

      console.log('Publishing Kind 1 note to relays...', noteEvent.toNostrEvent());
      await noteEvent.publish();

      // We can wait for at least one success but publish() already waits for that by default with NDK
      console.log('Post published successfully!', noteEvent.id);

      alert(`${type === 'photo' ? 'Photo' : 'Video'} uploaded and posted successfully!`);
      onUploadComplete();
      onClose();
      setFile(null);
      setDescription('');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="media-upload-overlay" onClick={onClose}>
      <div className="media-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-upload-header">
          Upload {type === 'photo' ? 'Photo' : 'Video'}
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="media-upload-body">
          <input
            type="file"
            accept={type === 'photo' ? 'image/*' : 'video/*'}
            onChange={handleFileChange}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <div className="file-drop-zone" onClick={() => fileInputRef.current?.click()}>
            {file ? (
              <div className="file-info">
                <strong>{file.name}</strong>
                <span>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            ) : (
              <span>Click to select {type === 'photo' ? 'an image' : 'a video'}</span>
            )}
          </div>

          <textarea
            className="media-description nostr-input"
            placeholder="Add a description (optional)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <button
            className="upload-submit-btn"
            disabled={!file || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};
