import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import BaseMediaPage from './BaseMediaPage';
import { useTitleDisplayMode, getItemDisplayName } from '@/hooks/useTitleDisplayMode';
import DescriptionItem from './DescriptionItem';
import { getPrimaryImageUrl } from '@/utils/jellyfinUrls';
import { ImageOff, Play, Share2 } from 'lucide-react';
import PeopleRow from './PeopleRow';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import MoreLikeThisRow from './MoreLikeThisRow';
import type { AppConfig } from '@/hooks/api/useConfig';
import DetailBadges from './DetailBadges';
import MediaInfoDialog from '../../components/MediaInfoDialog';
import FavoriteButton from '../../components/FavoriteButton';
import WatchListButton from '../../components/WatchlistButton';
import PlayStateButton from '../../components/PlayStateButton';
import { getUserId } from '@/utils/localstorageCredentials';
import ItemAdminButton from '@/components/ItemAdminButton';
import { useState } from 'react';
import { TrailerButton } from '../../components/TrailerButton';
import ItemDownloadButton from '../../components/ItemDownloadButton';
import SourcePickerButton from '@/components/SourcePickerButton';
import ShareDialog from '@/components/ShareDialog';

interface MoviePageProps {
    item: BaseItemDto;
    config: AppConfig;
}

const MoviePage = ({ item, config }: MoviePageProps) => {
    const { t } = useTranslation('item');
    const [postersFailed, setPostersFailed] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [titleMode] = useTitleDisplayMode();

    const writers =
        item.People?.filter((person) => person.Type === 'Writer').filter((person) => person.Name) ||
        [];
    const directors =
        item.People?.filter((person) => person.Type === 'Director').filter(
            (person) => person.Name
        ) || [];
    const studios = item.Studios?.filter((studio) => studio.Name) || [];

    const watched = item.UserData?.PlaybackPositionTicks ?? 0;
    const runtime = item.RunTimeTicks ?? 0;
    const progress = runtime > 0 ? (watched / runtime) * 100 : 0;
    const isCurrentlyPlaying = watched > 0 && runtime > 0 && watched < runtime;

    const getFilename = (path?: string | null) => {
        if (!path) return '';
        const parts = path.split(/[/\\]/);
        return parts[parts.length - 1];
    };

    const formatSize = (bytes?: number | null) => {
        if (!bytes) return '';
        if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
        return `${(bytes / 1e6).toFixed(1)} MB`;
    };

    const formatBitrate = (bitrate?: number | null) => {
        if (!bitrate) return '';
        return `${(bitrate / 1e6).toFixed(1)} Mbps`;
    };

    const filename = getFilename(item.Path || item.MediaSources?.[0]?.Path);
    const videoSize = formatSize(item.MediaSources?.[0]?.Size);
    const bitrateStr = formatBitrate(item.MediaSources?.[0]?.Bitrate);
    const videoCodec = item.MediaStreams?.find((s) => s.Type === 'Video')?.Codec?.toUpperCase() || '';
    const container = item.MediaSources?.[0]?.Container?.toUpperCase() || '';

    const isLandscape = item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 1;

    return (
        <BaseMediaPage itemId={item.Id || ''} name={item.Name || ''}>
            <div className="flex flex-col md:flex-row gap-6 max-w-7xl">
                {!postersFailed ? (
                    <div
                        className={
                            isLandscape
                                ? 'relative w-full max-w-[18rem] md:max-w-[24rem] mx-auto md:mx-0 shadow-lg rounded-md overflow-hidden group'
                                : 'relative w-48 min-w-[12rem] h-72 md:w-72 md:min-w-[18rem] md:h-108 mx-auto md:mx-0 shadow-lg rounded-md overflow-hidden group'
                        }
                        style={isLandscape ? { aspectRatio: item.PrimaryImageAspectRatio ?? undefined } : undefined}
                    >
                        <Link to={`/play/${item.Id}`} className="block w-full h-full relative cursor-pointer">
                            <img
                                src={getPrimaryImageUrl(
                                    item.Id || '',
                                    undefined,
                                    item.ImageTags?.Primary
                                )}
                                alt={item.Name + ' Primary'}
                                className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                                onError={() => setPostersFailed(true)}
                            />
                            {/* 半透明大播放按钮 */}
                            <div className="absolute inset-0 bg-black/15 md:bg-black/25 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                                <div className="h-16 w-16 bg-white/25 md:bg-white/20 hover:bg-white/35 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 shadow-xl">
                                    <Play className="h-8 w-8 text-white fill-white ml-1" />
                                </div>
                            </div>
                        </Link>
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
                    {isCurrentlyPlaying && (
                        <div className="w-full flex mt-2">
                            <Button
                                className="relative overflow-hidden w-full sm:w-[240px] h-10 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer font-semibold text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                                asChild
                            >
                                <Link to={`/play/${item.Id}`}>
                                    {/* Premium background progress overlay */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 bg-primary-foreground/20 pointer-events-none transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                    <Play className="h-4 w-4 fill-current shrink-0 relative z-10" />
                                    <span className="relative z-10">
                                        {t('resume', '续播')} ({Math.round(progress)}%)
                                    </span>
                                </Link>
                            </Button>
                        </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <SourcePickerButton
                            itemId={item.Id || ''}
                            mediaSources={item.MediaSources}
                            isCurrentlyPlaying={Boolean(isCurrentlyPlaying)}
                            playLabel={t('play', '播放')}
                            playFromBeginningLabel={t('play_from_beginning', '重播')}
                        />
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
                        <ItemDownloadButton
                            item={item}
                            showDownloadButton={config.itemPage?.showDownloadButton}
                        />
                        <MediaInfoDialog streams={item.MediaStreams || []} />
                        <ItemAdminButton item={item} showSubtitlesButton={true} />
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
                    {/* 视频文件信息栏 */}
                    {(filename || videoSize || bitrateStr || videoCodec) && (
                        <div className="mt-3 flex flex-col gap-1.5 p-3 rounded-lg bg-accent/15 border border-border/30 max-w-2xl backdrop-blur-sm">
                            {filename && (
                                <div className="text-[10px] leading-normal font-mono text-muted-foreground/90 break-all select-all flex items-start gap-1">
                                    <span className="shrink-0 font-sans font-semibold text-foreground/75">文件：</span>
                                    <span className="hover:text-foreground transition-colors">{filename}</span>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                                {videoSize && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">大小：</span>
                                        <span className="font-semibold text-foreground/80">{videoSize}</span>
                                    </div>
                                )}
                                {bitrateStr && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">码率：</span>
                                        <span className="font-semibold text-foreground/80">{bitrateStr}</span>
                                    </div>
                                )}
                                {(videoCodec || container) && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">格式：</span>
                                        <span className="font-semibold text-foreground/80">
                                            {videoCodec} {container ? `(${container})` : ''}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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
            <PeopleRow
                title={<h3 className="text-3xl font-bold">{t('cast_and_crew')}</h3>}
                people={item.People || []}
            />
            <MoreLikeThisRow
                title={<h3 className="text-3xl font-bold">{t('cast_and_crew')}</h3>}
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

export default MoviePage;
