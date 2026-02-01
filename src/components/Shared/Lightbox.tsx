import { useLightbox } from '../../context/LightboxContext';

export const Lightbox = () => {
    const { isOpen, imageUrl, closeLightbox } = useLightbox();

    if (!isOpen) return null;

    return (
        <div
            className="lightbox-overlay"
            onClick={closeLightbox}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 9999,
                cursor: 'pointer'
            }}
        >
            <div
                className="lightbox-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    maxWidth: '90%',
                    maxHeight: '90%',
                }}
            >
                <img
                    src={imageUrl}
                    alt="Full size"
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        display: 'block',
                        border: '1px solid #fff',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}
                />
                <button
                    onClick={closeLightbox}
                    style={{
                        position: 'absolute',
                        top: '-30px',
                        right: '-30px',
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: '24pt',
                        cursor: 'pointer',
                        padding: '10px'
                    }}
                >
                    &times;
                </button>
            </div>

            <style>{`
                .lightbox-overlay {
                    animation: fadeIn 0.2s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .lightbox-content img {
                    animation: zoomIn 0.2s ease-out;
                }
                @keyframes zoomIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default Lightbox;
