import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
}

export const SEO = ({
    title = "MyNostrSpace.com - Nostr-Powered Retro Social",
    description = "A customizable, retro-styled social profile powered by Nostr.",
    image = "/og-image.png", // Default image if we have one
    url = "https://mynostrspace.com",
    type = "website"
}: SEOProps) => {
    const siteTitle = title.includes("MyNostrSpace") ? title : `${title} | MyNostrSpace`;

    return (
        <Helmet>
            {/* Standard metadata tags */}
            <title>{siteTitle}</title>
            <meta name="description" content={description} />

            {/* OpenGraph tags */}
            <meta property="og:title" content={siteTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
            <meta property="og:url" content={url} />
            <meta property="og:type" content={type} />

            {/* Twitter Card tags */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={siteTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />
        </Helmet>
    );
};

export default SEO;
