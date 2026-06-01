import { useParams } from 'react-router';
import Page from '../Page';
import { useItem } from '@/hooks/api/useItem';
import MoviePage from './MoviePage';
import SeriesPage from './SeriesPage';
import { Skeleton } from '@/components/ui/skeleton';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@/hooks/api/useConfig';
import EpisodePage from './EpisodePage';
import SeasonPage from './SeasonPage';
import { getUserId } from '@/utils/localstorageCredentials';
import BoxSetPage from './BoxSetPage';
import MusicAlbumPage from './MusicAlbumPage';
import PlaylistPage from './PlaylistPage';
import GenrePage from './GenrePage';
import StudioPage from './StudioPage';
import { useLibraryItems } from '@/hooks/api/useLibraryItems';
import ItemsListPage, { type UseItemsHook } from './ItemsListPage';
import { getPrimaryImageUrl } from '@/utils/jellyfinUrls';
import WatchedStateBadge from '@/components/WatchedStateBadge';

const ItemPageSkeleton = memo(() => {
    return (
        <div className="relative h-full w-full">
            {/* banner */}
            <div className="absolute top-0 left-0 h-3/4 w-full -z-10">
                <Skeleton className="h-full w-full rounded-md border border-border" />
                <div className="absolute bottom-0 left-0 h-full w-full px-4 bg-linear-to-t from-background to-transparent rounded-md" />
            </div>

            {/* logo */}
            <div className="h-2/5 flex items-center justify-center">
                <Skeleton className="relative mx-auto px-4 h-32 w-48 object-contain rounded-md" />
            </div>

            {/* main content */}
            <div className="relative z-10 p-2 sm:p-4">
                <div className="bg-background/30 backdrop-blur-md p-4 sm:p-8 rounded-md w-full flex flex-col gap-8">
                    <div className="flex flex-col md:flex-row gap-6 max-w-7xl">
                        {/* poster */}
                        <div className="relative w-48 min-w-[12rem] h-72 md:w-72 md:min-w-[18rem] md:h-108 mx-auto md:mx-0 shadow-lg rounded-md overflow-hidden">
                            <Skeleton className="w-full h-full rounded-md" />
                        </div>

                        <div className="flex flex-col gap-3 flex-1">
                            {/* title */}
                            <Skeleton className="h-12 w-3/4 rounded-md" />

                            {/* top badges */}
                            <div className="flex flex-wrap gap-2">
                                <Skeleton className="h-8 w-20 rounded-md" />
                                <Skeleton className="h-8 w-16 rounded-md" />
                                <Skeleton className="h-8 w-12 rounded-md" />
                            </div>

                            {/* play button */}
                            <Skeleton className="h-10 w-32 rounded-md" />

                            {/* overview */}
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-full rounded-md" />
                                <Skeleton className="h-4 w-full rounded-md" />
                                <Skeleton className="h-4 w-2/3 rounded-md" />
                            </div>

                            {/* bottom items */}
                            <div className="space-y-3 pt-2">
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-20 rounded-md" />
                                    <div className="flex flex-wrap gap-2">
                                        <Skeleton className="h-6 w-24 rounded-md" />
                                        <Skeleton className="h-6 w-32 rounded-md" />
                                        <Skeleton className="h-6 w-20 rounded-md" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-20 rounded-md" />
                                    <div className="flex flex-wrap gap-2">
                                        <Skeleton className="h-6 w-28 rounded-md" />
                                        <Skeleton className="h-6 w-24 rounded-md" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-20 rounded-md" />
                                    <div className="flex flex-wrap gap-2">
                                        <Skeleton className="h-6 w-32 rounded-md" />
                                        <Skeleton className="h-6 w-28 rounded-md" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

ItemPageSkeleton.displayName = 'ItemPageSkeleton';

const useFolderItems: UseItemsHook = (id: string, params) => {
    const query = useLibraryItems(id, {
        limit: params.limit,
        startIndex: params.startIndex,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder[0],
        includeItemTypes: ['Folder', 'Video', 'Photo', 'Movie', 'Series'],
        recursive: false,
    });
    return {
        data: query.data,
        isLoading: query.isLoading,
        error: query.error,
    };
};

const ItemPage = () => {
    const { t } = useTranslation('item');
    const params = useParams<{ itemId: string }>();
    const itemId = params.itemId;

    const { config, loading: configLoading } = useConfig();
    const { data: item, isLoading, error } = useItem(itemId, true, getUserId() || undefined);

    return (
        <Page
            title={item ? `${item.Name}` : isLoading ? t('loading') : t('item_not_found')}
            className="flex-1 flex flex-col"
        >
            {(isLoading || configLoading) && <ItemPageSkeleton />}
            {error && <p>Error loading item details.</p>}
            {item &&
                (() => {
                    switch (item.Type) {
                        case 'Movie':
                            return <MoviePage item={item} config={config} />;
                        case 'Series':
                            return <SeriesPage item={item} config={config} />;
                        case 'Episode':
                            return <EpisodePage item={item} config={config} />;
                        case 'Season':
                            return <SeasonPage item={item} config={config} />;
                        case 'BoxSet':
                            return <BoxSetPage item={item} config={config} />;
                        case 'MusicAlbum':
                            return <MusicAlbumPage item={item} config={config} />;
                        case 'Playlist':
                            return <PlaylistPage item={item} config={config} />;
                        case 'Genre':
                            return <GenrePage item={item} />;
                        case 'Studio':
                            return <StudioPage item={item} />;
                        case 'Video':
                            return <MoviePage item={item} config={config} />;
                        case 'Photo':
                            return (
                                <div className="flex flex-col items-center justify-center p-4 min-h-[calc(100vh-12rem)]">
                                    <h2 className="text-3xl font-bold mb-4">{item.Name}</h2>
                                    <div className="max-w-5xl w-full aspect-auto rounded-md overflow-hidden shadow-lg border border-border">
                                        <img
                                            src={getPrimaryImageUrl(item.Id!, {}, item.ImageTags?.Primary)}
                                            alt={item.Name || ''}
                                            className="w-full h-auto max-h-[70vh] object-contain mx-auto"
                                        />
                                    </div>
                                    {item.Overview && (
                                        <p className="mt-4 max-w-2xl text-center text-muted-foreground">
                                            {item.Overview}
                                        </p>
                                    )}
                                </div>
                            );
                        case 'Folder':
                            return (
                                <ItemsListPage
                                    item={item}
                                    useItems={useFolderItems}
                                    renderItemOverlay={(child) => (
                                        <WatchedStateBadge
                                            item={child}
                                            show={config?.watchedStateBadgeLibrary || false}
                                        />
                                    )}
                                    posterAspectRatio="video"
                                />
                            );
                        default:
                            return (
                                <p>
                                    Unsupported item type "{item.Type}" for item "{item.Name}" with
                                    ID "{item.Id}"
                                </p>
                            );
                    }
                })()}
        </Page>
    );
};

export default ItemPage;
