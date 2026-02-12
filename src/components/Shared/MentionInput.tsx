import React, { useState, useRef, useEffect } from 'react';
import { useFriends } from '../../hooks/useFriends';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKUser, NDKSubscriptionCacheUsage, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { APP_RELAYS } from '../../utils/relay';
import { Avatar } from './Avatar';
import './MentionInput.css';

interface MentionInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    value: string;
    setValue: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    className?: string;
}

export const MentionInput: React.FC<MentionInputProps> = ({
    value,
    setValue,
    onKeyDown,
    placeholder,
    className,
    ...props
}) => {
    const { ndk, user } = useNostr();
    // Fetch profiles for friends to search by name
    const { friends: friendPubkeys } = useFriends(user?.pubkey);

    const [profiles, setProfiles] = useState<any[]>([]); // Friends
    const [searchResults, setSearchResults] = useState<any[]>([]); // Remote search results
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionQuery, setSuggestionQuery] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const profilesRef = useRef<Map<string, NDKUser>>(new Map());

    // Load profiles for friends incrementally
    useEffect(() => {
        if (!ndk || friendPubkeys.length === 0) return;

        // Check which profiles we already have in map
        const missingPubkeys = friendPubkeys.filter(pk => !profilesRef.current.has(pk));

        if (missingPubkeys.length === 0) {
            setProfiles(Array.from(profilesRef.current.values()));
            return;
        }

        const sub = ndk.subscribe(
            { kinds: [0], authors: missingPubkeys },
            { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }
        );

        sub.on('event', (event: NDKEvent) => {
            const user = new NDKUser({ pubkey: event.pubkey });
            user.profile = JSON.parse(event.content);
            profilesRef.current.set(event.pubkey, user);

            // Debounce update to avoid too many re-renders
            setProfiles(Array.from(profilesRef.current.values()));
        });

        return () => sub.stop();
    }, [friendPubkeys, ndk]);

    // Remote NIP-50 Search
    useEffect(() => {
        if (!ndk || !suggestionQuery || suggestionQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                const searchRelaySet = NDKRelaySet.fromRelayUrls(APP_RELAYS.SEARCH, ndk);
                const filter: NDKFilter = { kinds: [0], search: suggestionQuery, limit: 5 };

                const events = await ndk.fetchEvents(filter, {
                    relaySet: searchRelaySet,
                    cacheUsage: NDKSubscriptionCacheUsage.PARALLEL
                });

                const results = Array.from(events).map(event => {
                    const user = new NDKUser({ pubkey: event.pubkey });
                    try {
                        user.profile = JSON.parse(event.content);
                        return user;
                    } catch (e) {
                        return null;
                    }
                }).filter(u => u !== null);

                setSearchResults(results);
            } catch (e) {
                console.warn('Remote search failed', e);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timeoutId);
    }, [suggestionQuery, ndk]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset to re-calculate
            textareaRef.current.style.height = `${Math.max(60, textareaRef.current.scrollHeight)}px`;
        }
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
                textareaRef.current && !textareaRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setValue(newValue);

        const { selectionStart } = e.target;
        setCursorPosition(selectionStart);

        // Check for mention trigger
        const textBeforeCursor = newValue.slice(0, selectionStart);
        const words = textBeforeCursor.split(/\s/);
        const lastWord = words[words.length - 1];

        if (lastWord.startsWith('@')) {
            setShowSuggestions(true);
            setSuggestionQuery(lastWord.slice(1));
            setSelectedIndex(0);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredProfiles.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredProfiles.length) % filteredProfiles.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (filteredProfiles[selectedIndex]) {
                    selectUser(filteredProfiles[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }

        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    const selectUser = (userProfile: any) => {
        const textBeforeCursor = value.slice(0, cursorPosition);
        const textAfterCursor = value.slice(cursorPosition);

        const words = textBeforeCursor.split(/\s/);
        const lastWordLength = words[words.length - 1].length;

        const prefix = textBeforeCursor.slice(0, -lastWordLength);
        const mentionText = `nostr:${userProfile.npub}`;

        const newValue = `${prefix}${mentionText} ${textAfterCursor}`;
        setValue(newValue);
        setShowSuggestions(false);

        // Restore focus and update cursor (approximate)
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newCursorPos = prefix.length + mentionText.length + 1;
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 0);
    };

    const filteredProfiles = profiles.filter(p => {
        const name = p.profile?.name || p.profile?.displayName || p.profile?.display_name || '';
        return name.toLowerCase().includes(suggestionQuery.toLowerCase());
    });

    // Merge friend results with search results, deduplicating by pubkey
    const allSuggestions = [...filteredProfiles];

    searchResults.forEach(searchResult => {
        if (!allSuggestions.find(p => p.pubkey === searchResult.pubkey)) {
            allSuggestions.push(searchResult);
        }
    });

    const finalSuggestions = allSuggestions.slice(0, 5);

    return (
        <div className="mention-input-container">
            <textarea
                ref={textareaRef}
                className={className}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                {...props}
            />

            {showSuggestions && finalSuggestions.length > 0 && (
                <div className="mention-suggestions" ref={suggestionsRef}>
                    {finalSuggestions.map((p, index) => (
                        <div
                            key={p.pubkey}
                            className={`mention-suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => selectUser(p)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <Avatar pubkey={p.pubkey} src={p.profile?.image || p.profile?.picture} size={24} />
                            <div className="mention-suggestion-name">
                                {p.profile?.name || p.profile?.displayName || 'Unknown'} {p.profile?.nip05 ? '✓' : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
