import { Skeleton } from '@/components/ui/skeleton';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import type { TFunction } from 'i18next';
import { ImageOff, Star, Clock, FolderClosed } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import WatchedStateBadge from '@/components/WatchedStateBadge';
import { getApi } from '@/api/getApi';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getUserId } from '@/utils/localstorageCredentials';
import { getPrimaryImageUrl, getBackdropUrl } from '@/utils/jellyfinUrls';
import { useTitleDisplayMode, getItemDisplayName } from '@/hooks/useTitleDisplayMode';

const getAspectStyle = (ratio: string) => {
    if (ratio === 'video') return '16/9';
    if (ratio === 'square') return '1/1';
    if (ratio === '2/3') return '2/3';
    if (ratio === '9/16' || ratio === '9:16') return '9/16';
    if (ratio.includes('/')) return ratio;
    return ratio;
};

const LibraryItem = ({
    item,
    posterUrl,
    t,
    posterAspectRatio = '2/3',
    detailLine,
    layoutMode = 'grid',
    onFolderClick,
}: {
    item: BaseItemDto;
    posterUrl: string;
    t: TFunction;
    posterAspectRatio?: string;
    detailLine?: React.ReactNode;
    layoutMode?: 'grid' | 'list';
    onFolderClick?: (folder: { id: string; name: string }) => void;
}) => {
    const [posterError, setPosterError] = useState(false);
    const [titleMode] = useTitleDisplayMode();

    const isPhysicalFolder = item.Type === 'Folder';
    const isCollectionFolder = item.Type === 'CollectionFolder';
    const isFolder = item.IsFolder || isPhysicalFolder || isCollectionFolder;

    // 检查该文件夹是否有封面图哈希
    const hasPrimaryImage = !!item.ImageTags?.Primary;

    // 智能获取文件夹内部视频的最短播放进度和反哺封面
    const [folderProgress, setFolderProgress] = useState<number>(0);
    const [folderCoverUrl, setFolderCoverUrl] = useState<string>('');

    useEffect(() => {
        if (!isFolder || !item.Id || item.Id === 'undefined') return;

        let active = true;

        const fetchFolderSubData = async () => {
            try {
                const api = getApi();
                const itemsApi = getItemsApi(api);
                
                // 仅递归拉取该物理目录下前 10 个视频实体，仅算取内部的播放进度和反哺封面
                const response = await itemsApi.getItems({
                    parentId: item.Id!,
                    recursive: true,
                    limit: 10,
                    includeItemTypes: ['Movie', 'Episode', 'Video'],
                    userId: getUserId() || undefined,
                });

                if (!active) return;

                const subItems = response.data.Items || [];

                // 1. 优先挑选有进度的子项
                let minProg = 0;
                let activeSubItem: BaseItemDto | null = null;

                subItems.forEach((v) => {
                    const watchedTicks = v.UserData?.PlaybackPositionTicks ?? 0;
                    const runtimeTicks = v.RunTimeTicks ?? 0;
                    const isPlayed = v.UserData?.Played ?? false;

                    if (!isPlayed && watchedTicks > 0 && runtimeTicks > 0) {
                        const percent = (watchedTicks / runtimeTicks) * 100;
                        if (percent > 0) {
                            if (minProg === 0 || percent < minProg) {
                                minProg = percent;
                                activeSubItem = v;
                            }
                        }
                    }
                });

                setFolderProgress(minProg);

                // 2. 如果没有任何进度，但文件夹内有视频，随机挑选一个视频作为封面源
                if (!activeSubItem && subItems.length > 0) {
                    const randomIndex = Math.floor(Math.random() * subItems.length);
                    activeSubItem = subItems[randomIndex];
                }

                // 3. 提取该子视频的精美封面并反哺给当前物理文件夹
                if (activeSubItem && activeSubItem.Id) {
                    const subId = activeSubItem.Id;
                    const subTag = activeSubItem.ImageTags?.Primary;
                    let calculatedCover = '';

                    if (posterAspectRatio === 'video') {
                        // 横版模式：优先拉取 Backdrop，无则 Primary 降级
                        const backdropTag = activeSubItem.BackdropImageTags?.[0] || activeSubItem.ImageTags?.Backdrop;
                        if (backdropTag) {
                            calculatedCover = getBackdropUrl(subId, { width: 640, height: 360 }, backdropTag);
                        } else {
                            calculatedCover = getPrimaryImageUrl(subId, { width: 640 }, subTag);
                        }
                    } else {
                        // 默认竖版海报模式
                        calculatedCover = getPrimaryImageUrl(subId, { height: 640, width: 416 }, subTag);
                    }
                    setFolderCoverUrl(calculatedCover);
                }
            } catch (err) {
                console.warn('Folder sub-progress and cover fetch failed:', err);
            }
        };

        fetchFolderSubData();

        return () => {
            active = false;
        };
    }, [isFolder, item.Id, posterAspectRatio]);

    // 格式化时长 (将 ticks 转为分钟)
    const runtimeMinutes = !isFolder && item.RunTimeTicks 
        ? Math.round(item.RunTimeTicks / 10000000 / 60) 
        : null;

    // 计算播放进度百分比 (已播完的视频不显示进度条，避免视觉冗余)
    const watched = item.UserData?.PlaybackPositionTicks ?? 0;
    const runtime = item.RunTimeTicks ?? 0;
    const played = item.UserData?.Played ?? false;
    
    // 如果是普通视频直接取自身 progress，如果是文件夹，取算出的最短子进度 folderProgress
    const progress = isFolder
        ? folderProgress
        : (!played && watched > 0 && runtime > 0 ? (watched / runtime) * 100 : 0);

    // 渲染媒体进度条 (z-20 确保覆盖在图片 z-10 之上)
    const ProgressBar = () => {
        if (progress <= 0) return null;
        return (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 z-20 overflow-hidden">
                <div
                    style={{ width: `${progress}%` }}
                    className="h-full bg-brand transition-all duration-300"
                />
            </div>
        );
    };

    // 拦截文件夹点击，跳转至深钻层级
    const handleLinkClick = (e: React.MouseEvent) => {
        if (isFolder && onFolderClick) {
            e.preventDefault();
            onFolderClick({ id: item.Id!, name: item.Name! });
        }
    };

    // 渲染高精圆角文件夹封套 (文件夹模式下永远作为默认的卡片外观展现，不显示视频海报封面)
    const FolderWrapper = () => (
        <div className="w-full h-full bg-gradient-to-tr from-accent/40 via-accent/20 to-background flex flex-col items-center justify-center rounded-md border border-accent/20 group-hover:border-primary/50 transition-all duration-300">
            <FolderClosed className="text-4xl text-amber-500 fill-amber-500/10 group-hover:scale-105 transition-transform duration-300" />
            <span className="text-xs text-muted-foreground mt-2 font-medium">
                {t('library:folder', '文件夹')}
            </span>
        </div>
    );

    // 物理文件夹或合集封面左上角的精美微型指示器
    const FolderCornerIndicator = () => (
        <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-md border border-white/10 text-white rounded-md p-1.5 flex items-center justify-center z-20 shadow-md">
            <FolderClosed className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
        </div>
    );

    // 当前卡片最终采用的封面图片
    const finalPosterUrl = isPhysicalFolder 
        ? (hasPrimaryImage ? posterUrl : folderCoverUrl)
        : posterUrl;

    // 是否渲染黄色文件夹图标：物理文件夹无主图且无子图片反哺时渲染
    const shouldRenderFolderIcon = isPhysicalFolder && !hasPrimaryImage && !folderCoverUrl;

    if (layoutMode === 'list') {
        return (
            <Link 
                to={`/item/${item.Id}`} 
                key={item.Id} 
                className="flex items-center gap-4 p-3 border rounded-lg bg-card hover:bg-accent/40 transition-colors duration-200 w-full group text-left"
                onClick={handleLinkClick}
            >
                {/* 左侧横版背景/海报 */}
                <div
                    style={{ aspectRatio: getAspectStyle(posterAspectRatio) }}
                    className="relative w-[140px] sm:w-[180px] shrink-0 h-auto overflow-hidden rounded-md group-hover:opacity-90 transition-opacity"
                >
                    {shouldRenderFolderIcon ? (
                        <FolderWrapper />
                    ) : !posterError && finalPosterUrl ? (
                        <>
                            <img
                                key={item.Id}
                                src={finalPosterUrl}
                                alt={item.Name || t('library:no_title')}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                className="absolute inset-0 w-full h-full object-cover rounded-md group-hover:scale-102 transition-transform duration-300"
                                loading="lazy"
                                onError={() => setPosterError(true)}
                            />
                            <Skeleton className="absolute bottom-0 left-0 right-0 top-0 -z-1" />
                        </>
                    ) : (
                        // 如果加载失败，物理文件夹仍然退回 FolderWrapper，普通视频显示 ImageOff
                        isFolder ? (
                            <FolderWrapper />
                        ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center rounded-md">
                                <ImageOff className="text-2xl text-muted-foreground" />
                            </div>
                        )
                    )}
                    <WatchedStateBadge item={item} show={!isFolder} />
                    {!shouldRenderFolderIcon && isFolder && <FolderCornerIndicator />}
                    <ProgressBar />
                </div>

                {/* 右侧详细信息 */}
                <div className="flex-1 min-w-0 flex flex-col justify-center py-1">
                    <h3 className="font-semibold text-base sm:text-lg line-clamp-1 group-hover:text-primary transition-colors duration-200">
                        {getItemDisplayName(item, titleMode) || t('library:no_title')}
                    </h3>
                    
                    {/* 属性标签（年份、评分、时长） */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {(item as any).ShareOwnerName && (
                            <span className="font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-[10px]">
                                {t('shared_by', '由')} {(item as any).ShareOwnerName} {t('share', '分享')}
                            </span>
                        )}
                        {isFolder ? (
                            <span className="font-medium text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">
                                {t('library:folder', '文件夹')}
                            </span>
                        ) : (
                            <>
                                {detailLine && (
                                    <span className="font-medium text-foreground/80">
                                        {detailLine}
                                    </span>
                                )}
                                {item.CommunityRating && (
                                    <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                                        <Star className="h-3.5 w-3.5 fill-current" />
                                        {item.CommunityRating.toFixed(1)}
                                    </span>
                                )}
                                {runtimeMinutes && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5" />
                                        {runtimeMinutes} {t('common:minutes', '分钟')}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {/* 简介 Overview */}
                    {!isFolder && item.Overview && (
                        <p className="mt-2 text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {item.Overview}
                        </p>
                    )}
                </div>
            </Link>
        );
    }

    // 默认的 Grid 卡片模式
    return (
        <Link 
            to={`/item/${item.Id}`} 
            key={item.Id} 
            className="p-0 m-0"
            onClick={handleLinkClick}
        >
            <div
                style={{ aspectRatio: getAspectStyle(posterAspectRatio) }}
                className="relative w-full h-auto overflow-hidden rounded-md group"
            >
                {shouldRenderFolderIcon ? (
                    <FolderWrapper />
                ) : !posterError && finalPosterUrl ? (
                    <>
                        <img
                            key={item.Id}
                            src={finalPosterUrl}
                            alt={item.Name || t('library:no_title')}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', zIndex: 10 }}
                            className="absolute inset-0 w-full h-full object-cover rounded-md group-hover:opacity-75 transition-all group-hover:scale-105 z-10"
                            loading="lazy"
                            onError={() => setPosterError(true)}
                        />
                        <Skeleton className="absolute bottom-0 left-0 right-0 top-0 -z-1" />
                    </>
                ) : (
                    // 如果加载失败，物理文件夹仍然退回 FolderWrapper，普通视频显示 ImageOff
                    isFolder ? (
                        <FolderWrapper />
                    ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center rounded-md">
                            <ImageOff className="text-4xl text-muted-foreground" />
                        </div>
                    )
                )}
                <WatchedStateBadge item={item} show={!isFolder} />
                {!shouldRenderFolderIcon && isFolder && <FolderCornerIndicator />}
                <ProgressBar />
            </div>
            <p className="mt-2 text-sm line-clamp-1 text-ellipsis break-all">
                {getItemDisplayName(item, titleMode) || t('library:no_title')}
            </p>
            <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
                <span className="text-xs text-muted-foreground mr-2 line-clamp-1">
                    {isFolder ? t('library:folder', '文件夹') : detailLine}
                </span>
                {(item as any).ShareOwnerName && (
                    <span className="text-[10px] text-primary font-medium bg-primary/10 border border-primary/25 px-1.5 py-0.5 rounded-full truncate">
                        {(item as any).ShareOwnerName}
                    </span>
                )}
            </div>
        </Link>
    );
};

export default LibraryItem;
