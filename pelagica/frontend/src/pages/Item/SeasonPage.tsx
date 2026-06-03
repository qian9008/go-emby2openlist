import type { AppConfig } from '@/hooks/api/useConfig';
import { useTitleDisplayMode, getItemDisplayName } from '@/hooks/useTitleDisplayMode';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import BaseMediaPage from './BaseMediaPage';
import { useTranslation } from 'react-i18next';
import { getPrimaryImageUrl } from '@/utils/jellyfinUrls';
import DetailBadges from './DetailBadges';
import { useState } from 'react';
import { useSeasons } from '@/hooks/api/useSeasons';
import EpisodesDisplay from './EpisodesDisplay';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import PeopleRow from './PeopleRow';
import { Link } from 'react-router';
import JellyfinItemKindIcon from '@/components/JellyfinItemKindIcon';
import FavoriteButton from '../../components/FavoriteButton';
import { Skeleton } from '@/components/ui/skeleton';
import ItemAdminButton from '@/components/ItemAdminButton';
import { ImageOff } from 'lucide-react';
import { getUserId } from '../../utils/localstorageCredentials';
import PlayStateButton from '../../components/PlayStateButton';
import { useUpcomingEpisodes } from '../../hooks/api/useUpcomingEpisodes';
import UpcomingEpisodeComponent from './UpcomingEpisodeComponent';

interface EpisodePageProps {
    item: BaseItemDto;
    config: AppConfig;
}

const SeasonPage = ({ item, config }: EpisodePageProps) => {
    const { t } = useTranslation('item');
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
    const [titleMode] = useTitleDisplayMode();
    const { data: seasons, isLoading: isLoadingSeasons } = useSeasons(item.SeriesId || '');
    const [posterFailed, setPosterFailed] = useState(false);
    const { data: upcomingEpisodes } = useUpcomingEpisodes(item.Id || '');
    console.log('Upcoming Episodes:', upcomingEpisodes);

    const effectiveSelectedSeason =
        selectedSeason ||
        (seasons && seasons.length > 0
            ? seasons.find((s) => s.IndexNumber === item.IndexNumber)?.Id || seasons[0]?.Id || ''
            : '');

    const isLandscape = item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 1;

    return (
        <BaseMediaPage itemId={item.SeriesId || ''} name={item.SeriesName || item.Name || ''}>
            <div className="flex flex-col md:flex-row gap-6 max-w-7xl">
                {!posterFailed ? (
                    <div
                        className={
                            isLandscape
                                ? 'relative w-full max-w-[18rem] md:max-w-[24rem] mx-auto md:mx-0 shadow-lg rounded-md overflow-hidden'
                                : 'relative w-48 min-w-[12rem] h-72 md:w-72 md:min-w-[18rem] md:h-108 mx-auto md:mx-0 shadow-lg rounded-md overflow-hidden'
                        }
                        style={isLandscape ? { aspectRatio: item.PrimaryImageAspectRatio ?? undefined } : undefined}
                    >
                        <img
                            src={getPrimaryImageUrl(
                                item.Id || '',
                                undefined,
                                item.ImageTags?.Primary
                            )}
                            alt={item.Name + ' Primary'}
                            className="object-cover rounded-md w-full h-full"
                            onError={() => setPosterFailed(true)}
                        />
                        <Skeleton className="absolute inset-0 w-full h-full rounded-md -z-1" />
                    </div>
                ) : (
                    <div
                        className={
                            isLandscape
                                ? 'w-full max-w-[18rem] md:max-w-[24rem] mx-auto md:mx-0 rounded-md bg-muted flex items-center justify-center shadow-lg'
                                : 'w-48 min-w-[12rem] h-72 md:w-72 md:min-w-[18rem] md:h-108 mx-auto md:mx-0 rounded-md bg-muted flex items-center justify-center shadow-lg'
                        }
                        style={isLandscape ? { aspectRatio: item.PrimaryImageAspectRatio ?? undefined } : undefined}
                    >
                        <ImageOff className="text-muted-foreground" size={32} />
                    </div>
                )}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center text-sm text-muted-foreground">
                        <Link
                            to={`/item/${item.SeriesId}`}
                            className="hover:underline flex items-center gap-2"
                        >
                            <JellyfinItemKindIcon kind="Series" className="h-4 w-4" />
                            <span className="line-clamp-1 text-ellipsis break-all">
                                {item.SeriesName || t('no_title')}
                            </span>
                        </Link>
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold -mt-2">
                        {getItemDisplayName(item, titleMode)}
                    </h2>
                    <DetailBadges item={item} appConfig={config} />
                    <div className="mt-1 flex items-center gap-2">
                        <FavoriteButton
                            item={item}
                            showFavoriteButton={
                                item.Type && config.itemPage?.favoriteButton?.includes(item.Type)
                            }
                        />
                        <PlayStateButton itemId={item.Id || ''} userId={getUserId() || ''} />
                        <ItemAdminButton item={item} />
                    </div>
                    <p>{item.Overview}</p>
                </div>
            </div>
            {upcomingEpisodes && upcomingEpisodes.length > 0 && (
                <div>
                    <h3 className="text-3xl font-bold mb-3">{t('upcoming_episodes')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                        {upcomingEpisodes.map((episode) => (
                            <UpcomingEpisodeComponent key={episode.Id} episode={episode} t={t} />
                        ))}
                    </div>
                </div>
            )}
            <EpisodesDisplay
                title={
                    <div className="flex items-center gap-4">
                        <h3 className="text-3xl font-bold">{t('episodes')}</h3>
                        <Select
                            value={effectiveSelectedSeason || ''}
                            onValueChange={(value) => setSelectedSeason(value || null)}
                            disabled={isLoadingSeasons || !seasons || seasons.length === 0}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={t('select_season')} />
                            </SelectTrigger>
                            <SelectContent>
                                {seasons?.map((season) => (
                                    <SelectItem
                                        key={season.Id}
                                        value={season.Id || ''}
                                        onSelect={() => setSelectedSeason(season.Id || null)}
                                    >
                                        {season.Name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                }
                seasonsLoading={isLoadingSeasons}
                seasonId={effectiveSelectedSeason}
                episodeDisplay={config.itemPage?.episodeDisplay || 'row'}
            />
            <PeopleRow
                people={item.People || []}
                title={<h3 className="text-3xl font-bold">{t('cast_and_crew')}</h3>}
            />
        </BaseMediaPage>
    );
};

export default SeasonPage;
