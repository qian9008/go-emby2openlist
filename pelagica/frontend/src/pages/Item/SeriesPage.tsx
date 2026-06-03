import { Button } from '@/components/ui/button';
import { useTitleDisplayMode, getItemDisplayName } from '@/hooks/useTitleDisplayMode';
import { useSeasons } from '@/hooks/api/useSeasons';
import { getPrimaryImageUrl } from '@/utils/jellyfinUrls';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { ImageOff, Play, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useEpisodes } from '@/hooks/api/useEpisodes';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import PeopleRow from './PeopleRow';
import BaseMediaPage from './BaseMediaPage';
import DescriptionItem from './DescriptionItem';
import MoreLikeThisRow from './MoreLikeThisRow';
import { type AppConfig } from '@/hooks/api/useConfig';
import DetailBadges from './DetailBadges';
import EpisodesDisplay from './EpisodesDisplay';
import FavoriteButton from '../../components/FavoriteButton';
import WatchListButton from '../../components/WatchlistButton';
import PlayStateButton from '../../components/PlayStateButton';
import { getUserId } from '@/utils/localstorageCredentials';
import ItemAdminButton from '@/components/ItemAdminButton';
import { TrailerButton } from '../../components/TrailerButton';
import { useUpcomingEpisodes } from '../../hooks/api/useUpcomingEpisodes';
import UpcomingEpisodeComponent from './UpcomingEpisodeComponent';
import ShareDialog from '@/components/ShareDialog';

interface SeriesPageProps {
    item: BaseItemDto;
    config: AppConfig;
}

const SeriesPage = ({ item, config }: SeriesPageProps) => {
    const { t } = useTranslation('item');
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [titleMode] = useTitleDisplayMode();
    const { data: seasons, isLoading, error } = useSeasons(item.Id || '');
    const [posterFailed, setPosterFailed] = useState(false);
    const { data: upcomingEpisodes } = useUpcomingEpisodes(item.Id || '');
    console.log('Upcoming Episodes:', upcomingEpisodes);

    const effectiveSelectedSeason =
        selectedSeason ||
        (seasons && seasons.length > 0
            ? seasons.find((s) => s.IndexNumber === 1)?.Id || seasons[0]?.Id || ''
            : '');

    const firstSeasonId =
        seasons && seasons.length > 0
            ? seasons.find((s) => s.IndexNumber === 1)?.Id || seasons[0]?.Id
            : undefined;
    const { data: firstSeasonEpisodes } = useEpisodes(firstSeasonId);

    const episodeToContinue =
        firstSeasonEpisodes?.find(
            (ep) => !ep.UserData?.Played || (ep.UserData?.PlaybackPositionTicks ?? 0) > 0
        ) || firstSeasonEpisodes?.[0];

    const writers =
        item.People?.filter((person) => person.Type === 'Writer').filter((person) => person.Name) ||
        [];
    const directors =
        item.People?.filter((person) => person.Type === 'Director').filter(
            (person) => person.Name
        ) || [];
    const studios = item.Studios?.filter((studio) => studio.Name) || [];

    const isLandscape = item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 1;

    return (
        <BaseMediaPage itemId={item.Id || ''} name={item.Name || ''}>
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
                    <h2 className="text-4xl sm:text-5xl font-bold mt-2">
                        {getItemDisplayName(item, titleMode)}
                    </h2>
                    <DetailBadges item={item} appConfig={config} />
                    <div className="mt-1 flex items-center gap-2">
                        {episodeToContinue ? (
                            <Button className="w-fit" asChild>
                                <Link to={`/play/${episodeToContinue.Id}`}>
                                    <Play />
                                    {episodeToContinue.UserData?.PlaybackPositionTicks
                                        ? t('continue_episode', {
                                              season: episodeToContinue.ParentIndexNumber,
                                              episode: episodeToContinue.IndexNumber,
                                          })
                                        : t('play_episode', {
                                              season: episodeToContinue.ParentIndexNumber,
                                              episode: episodeToContinue.IndexNumber,
                                          })}
                                </Link>
                            </Button>
                        ) : (
                            <Button className="w-fit" disabled>
                                <Play />
                                {t('loading')}
                            </Button>
                        )}
                        <TrailerButton item={item} />
                        <FavoriteButton
                            item={item}
                            showFavoriteButton={
                                item.Type && config.itemPage?.favoriteButton?.includes(item.Type)
                            }
                        />
                        <WatchListButton
                            item={item}
                            showWatchlistButton={config.itemPage?.showWatchlistButton}
                        />
                        <PlayStateButton itemId={item.Id || ''} userId={getUserId() || ''} />
                        <ItemAdminButton item={item} />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md"
                            onClick={() => setShareOpen(true)}
                            title={t('share', '分享')}
                        >
                            <Share2 className="h-5 w-5" />
                        </Button>
                    </div>
                    <p>{item.Overview}</p>
                    <DescriptionItem
                        label={t('genres')}
                        items={
                            item.GenreItems?.map((genre) => ({
                                link: `/item/${genre.Id}`,
                                name: genre.Name!,
                            })) || []
                        }
                    />
                    <DescriptionItem
                        label={t('writers')}
                        items={writers.map((person) => ({
                            link: `/person/${person.Id}`,
                            name: person.Name!,
                        }))}
                    />
                    <DescriptionItem
                        label={t('directors')}
                        items={directors.map((person) => ({
                            link: `/person/${person.Id}`,
                            name: person.Name!,
                        }))}
                    />
                    <DescriptionItem
                        label={t('studios')}
                        items={studios.map((studio) => ({
                            link: `/item/${studio.Id}`,
                            name: studio.Name!,
                        }))}
                    />
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
            <div>
                <EpisodesDisplay
                    title={
                        <div className="flex items-center gap-4">
                            <h3 className="text-3xl font-bold">{t('episodes')}</h3>
                            <Select
                                value={effectiveSelectedSeason || ''}
                                onValueChange={(value) => setSelectedSeason(value || null)}
                                disabled={isLoading || !seasons || seasons.length === 0}
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
                    seasonsLoading={isLoading}
                    seasonId={effectiveSelectedSeason}
                    episodeDisplay={config.itemPage?.episodeDisplay || 'row'}
                />
                {error && <p>Error loading seasons: {(error as Error).message}</p>}
            </div>
            <PeopleRow
                title={<h3 className="text-3xl font-bold">{t('cast_and_crew')}</h3>}
                people={item.People || []}
                loading={isLoading}
            />
            <MoreLikeThisRow
                title={<h3 className="text-3xl font-bold">{t('more_like_this')}</h3>}
                itemId={item.Id || ''}
            />
            <ShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                mediaId={item.Id || ''}
                mediaName={item.Name || ''}
            />
        </BaseMediaPage>
    );
};

export default SeriesPage;
