import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface LightboxContextType {
    isOpen: boolean;
    imageUrl: string;
    openLightbox: (url: string) => void;
    closeLightbox: () => void;
}

const LightboxContext = createContext<LightboxContextType | undefined>(undefined);

export const LightboxProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [imageUrl, setImageUrl] = useState('');

    const openLightbox = (url: string) => {
        setImageUrl(url);
        setIsOpen(true);
    };

    const closeLightbox = () => {
        setIsOpen(false);
        setImageUrl('');
    };

    return (
        <LightboxContext.Provider value={{ isOpen, imageUrl, openLightbox, closeLightbox }}>
            {children}
        </LightboxContext.Provider>
    );
};

export const useLightbox = () => {
    const context = useContext(LightboxContext);
    if (!context) {
        throw new Error('useLightbox must be used within a LightboxProvider');
    }
    return context;
};
