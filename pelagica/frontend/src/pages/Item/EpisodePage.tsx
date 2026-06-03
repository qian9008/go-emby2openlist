import type { AppConfig } from '@/hooks/api/useConfig';
import { useTitleDisplayMode, getItemDisplayName } from '@/hooks/useTitleDisplayMode';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import BaseMediaPage from './BaseMediaPage';
import { Dot, ImageOff, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { getPrimaryImageUrl, getThumbUrl } from '@/utils/jellyfinUrls';
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
import JellyfinItemKindIcon from '@/components/JellyfinItemKindIcon';
import MediaInfoDialog from '../../components/MediaInfoDialog';
import FavoriteButton from '../../components/FavoriteButton';
import { getUserId } from '@/utils/localstorageCredentials';
import PlayStateButton from '../../components/PlayStateButton';
import ItemAdminButton from '@/components/ItemAdminButton';
import ItemDownloadButton from '../../components/ItemDownloadButton';
import SourcePickerButton from '@/components/SourcePickerButton';
import { Link } from 'react-router';

interface EpisodePageProps {
    item: BaseItemDto;
    config: AppConfig;
}

const EpisodePage = ({ item, config }: EpisodePageProps) => {
    const { t } = useTranslation('item');
    const [imageError, setImageError] = useState<boolean>(false);
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
    const [titleMode] = useTitleDisplayMode();
    const { data: seasons, isLoading: isLoadingSeasons } = useSeasons(item.SeriesId || '');

    const effectiveSelectedSeason =
        selectedSeason ||
        (seasons && seasons.length > 0
            ? seasons.find((s) => s.IndexNumber === item.ParentIndexNumber)?.Id ||
              seasons[0]?.Id ||
              ''
            : '');

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

    return (
        <BaseMediaPage itemId={item.SeriesId || ''} name={item.SeriesName || item.Name || ''}>
            <div className="flex flex-col md:flex-row gap-6 max-w-7xl">
                <div className="w-full sm:w-1/3 lg:w-1/4 flex flex-col">
                    <div className="relative w-full aspect-video rounded-md overflow-hidden group">
                        {imageError ? (
                            <div className="w-full h-full bg-muted flex items-center justify-center rounded-md">
                                <ImageOff className="w-12 h-12 text-muted-foreground" />
                            </div>
                        ) : (
                            <Link to={`/play/${item.Id}`} className="block w-full h-full relative cursor-pointer">
                                <img
                                    src={
                                        item.SeriesId
                                            ? getPrimaryImageUrl(
                                                  item.Id!,
                                                  {
                                                      width: 416,
                                                  },
                                                  item.ImageTags?.Primary
                                              )
                                            : getThumbUrl(
                                                  item.Id!,
                                                  {
                                                      width: 416,
                                                  },
                                                  item.ImageTags?.Thumb
                                              )
                                    }
                                    alt={item.Name || t('no_title')}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    onError={() => setImageError(true)}
                                />
                                {/* 半透明大播放按钮 */}
                                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                                    <div className="h-14 w-14 bg-white/20 hover:bg-white/35 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 shadow-xl">
                                        <Play className="h-7 w-7 text-white fill-white ml-1" />
                                    </div>
                                </div>
                            </Link>
                        )}
                        {progress > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700 z-30">
                                <div
                                    style={{ width: `${progress}%` }}
                                    className="h-full bg-brand transition-width"
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col gap-3 w-full sm:w-2/3 lg:w-3/4">
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
                        <Dot />
                        <Link
                            to={`/item/${item.ParentId}`}
                            className="hover:underline line-clamp-1 text-ellipsis break-all"
                        >
                            {t('season_x', {
                                number: item.ParentIndexNumber || 0,
                            })}
                        </Link>
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold -mt-2">
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
                            isCurrentlyPlaying={isCurrentlyPlaying}
                            playLabel={t('play', '播放')}
                            playFromBeginningLabel={t('play_from_beginning', '重播')}
                        />
                        <FavoriteButton
                            item={item}
                            showFavoriteButton={
                                item.Type && config.itemPage?.favoriteButton?.includes(item.Type)
                            }
                        />
                        <PlayStateButton itemId={item.Id || ''} userId={getUserId() || ''} />
                        <ItemDownloadButton
                            item={item}
                            showDownloadButton={config.itemPage?.showDownloadButton}
                        />
                        <MediaInfoDialog streams={item.MediaStreams || []} />
                        <ItemAdminButton item={item} showSubtitlesButton={true} />
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
                </div>
            </div>
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

export default EpisodePage;
