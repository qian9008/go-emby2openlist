import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    ArrowLeft,
    PictureInPicture2,
    AudioLines,
    SkipForward,
    Subtitles,
    Dot,
    Info,
    Minimize,
    SkipBack,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Link, useNavigate } from 'react-router';
import type {
    BaseItemDto,
    MediaSegmentDto,
    MediaSegmentType,
    TrickplayInfoDto,
} from '@jellyfin/sdk/lib/generated-client/models';
import { Slider } from '../../components/ui/slider';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPlayTime, ticksToReadableTime, ticksToSeconds } from '@/utils/timeConversion';
import { useTranslation } from 'react-i18next';
import { usePlayerKeyboardControls } from '@/hooks/usePlayerKeyboardControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPrimaryImageUrl, getTrickplayImageUrl } from '@/utils/jellyfinUrls';
import { useReportPlaybackProgress } from '@/hooks/api/usePlaybackProgress';
import { getRuntimePlaybackStats, type RuntimePlaybackStats } from '@/utils/playbackStats';
import { useSession } from '@/hooks/api/useSession';
import {
    removeLastSubtitleLanguage,
    setLastAudioLanguage,
    setLastSubtitleLanguage,
} from '@/utils/localstorageLastlanguage';

function getPrimaryTrickplayInfo(trickplay?: BaseItemDto['Trickplay']) {
    if (!trickplay) return null;

    const entries = Object.values(trickplay);
    if (entries.length === 0) return null;
    const subEntries = Object.values(entries[0]);
    return subEntries[0] || null;
}

function getTrickplayTile(time: number, trickplay: TrickplayInfoDto) {
    const interval = trickplay.Interval ?? 1;
    const tileWidth = trickplay.TileWidth ?? 1;
    const tileHeight = trickplay.TileHeight ?? 1;

    const timeMs = time * 1000;
    const thumbnailIndex = Math.floor(timeMs / interval);
    const tilesPerImage = tileWidth * tileHeight;

    const imageIndex = Math.floor(thumbnailIndex / tilesPerImage);
    const tileIndex = thumbnailIndex % tilesPerImage;

    const x = tileIndex % tileWidth;
    const y = Math.floor(tileIndex / tileWidth);

    console.log({
        time,
        interval: trickplay.Interval,
        thumbnailIndex,
        tilesPerImage,
        imageIndex,
        totalImages: Math.ceil((trickplay.ThumbnailCount ?? 0) / tilesPerImage),
    });

    return {
        thumbnailIndex,
        imageIndex,
        x,
        y,
        width: trickplay.Width,
        height: trickplay.Height,
    };
}

interface PlayerControlsProps {
    item: BaseItemDto;
    player: ReturnType<typeof import('video.js').default> | null;
    audioTrackIndex: number | null;
    onAudioTrackChange: (index: number) => void;
    subtitleTrackIndex: number | null;
    onSubtitleTrackChange: (index: number | null) => void;
    isFullscreen: boolean;
    onFullscreenToggle?: () => void;
    mediaSegments?: MediaSegmentDto[];
    previousItem?: BaseItemDto | null;
    nextItem?: BaseItemDto | null;
    srcUrl: string;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

const PlayerControls = ({
    item,
    player,
    audioTrackIndex,
    onAudioTrackChange,
    subtitleTrackIndex,
    onSubtitleTrackChange,
    isFullscreen,
    onFullscreenToggle,
    mediaSegments,
    previousItem,
    nextItem,
    srcUrl,
    containerRef,
}: PlayerControlsProps) => {
    const { t } = useTranslation('player');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [bufferedTime, setBufferedTime] = useState(0);
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('playerVolume');
        return saved ? parseFloat(saved) : 1;
    });
    const [isMuted, setIsMuted] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverPosition, setHoverPosition] = useState<number>(0);
    const [showControls, setShowControls] = useState(true);
    const [isPiP, setIsPiP] = useState(false);
    // 是否显示音量条的状态，默认为隐藏
    const [showVolumeBar, setShowVolumeBar] = useState(false);

    // 当播放器控制栏隐藏时，同步隐藏音量条
    useEffect(() => {
        if (!showControls) {
            setShowVolumeBar(false);
        }
    }, [showControls]);

    // 播放速度状态，默认为 1.0，并支持持久化读取
    const [playbackRate, setPlaybackRate] = useState(() => {
        const saved = localStorage.getItem('playerPlaybackRate');
        return saved ? parseFloat(saved) : 1;
    });

    // 播放速度变更时，保存到本地并同步应用到播放器
    useEffect(() => {
        localStorage.setItem('playerPlaybackRate', playbackRate.toString());
        if (player && !player.isDisposed?.()) {
            player.playbackRate(playbackRate);
        }
    }, [playbackRate, player]);
    const progressRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const navigate = useNavigate();
    const { reportProgress } = useReportPlaybackProgress();
    const [dismissedNextItemPrompt, setDismissedNextItemPrompt] = useState(false);
    const [stats, setStats] = useState<RuntimePlaybackStats | null>(null);
    const [showStats, setShowStats] = useState(false);
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const { data: session } = useSession(item.Id, showStats);

    useEffect(() => {
        setContainer(containerRef.current);
    }, [containerRef]);

    useEffect(() => {
        if (!player) return;
        const update = () =>
            setStats(getRuntimePlaybackStats(player, item, session, audioTrackIndex, srcUrl));
        update();
        const interval = setInterval(update, 2000);
        return () => clearInterval(interval);
    }, [player, item, session, audioTrackIndex, srcUrl, showStats]);

    const resetHideTimeout = useCallback(() => {
        setShowControls(true);
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        // 仅在视频播放状态下，才启动自动隐藏的定时器
        if (isPlaying) {
            hideTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    }, [isPlaying]);

    // 监听播放状态的变化：若暂停则销毁定时器锁定常显，若播放则重新启动隐藏定时器
    useEffect(() => {
        if (!isPlaying) {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
            setShowControls(true);
        } else {
            resetHideTimeout();
        }
    }, [isPlaying, resetHideTimeout]);

    const handleMouseMove = () => {
        resetHideTimeout();
    };

    const handleMouseLeave = () => {
        // 仅在视频正在播放时，鼠标离开才触发自动收起控制面板
        if (isPlaying) {
            setShowControls(false);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        }
    };

    const markItemAsCompleted = useCallback(
        (itemId: string | undefined) => {
            if (!itemId) return;
            reportProgress({
                itemId,
                positionTicks: item.RunTimeTicks || 0,
                isPaused: true,
            });
        },
        [item.RunTimeTicks, reportProgress]
    );

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('playerVolume', volume.toString());
    }, [volume]);

    useEffect(() => {
        if (!player || player.isDisposed?.()) return;

        player.volume(volume);

        const updatePlayState = () => setIsPlaying(!player.paused());
        const updateTime = () => setCurrentTime(player.currentTime() || 0);
        const updateDuration = () => {
            setDuration(player.duration() || 0);
            // 确保视频加载/切换流后播放速度被正确同步
            player.playbackRate(playbackRate);
        };
        const updateMuted = () => setIsMuted(player.muted() || false);
        const updateBuffered = () => {
            const buffered = player.buffered();
            if (buffered && buffered.length > 0) {
                setBufferedTime(buffered.end(buffered.length - 1));
            }
        };

        const handleEnded = () => {
            if (!nextItem) return;
            markItemAsCompleted(item.Id);
            navigate(`/play/${nextItem.Id}`);
        };

        // PiP event listeners
        const videoEl = player.el()?.querySelector('video');
        const handleEnterPiP = () => setIsPiP(true);
        const handleLeavePiP = () => setIsPiP(false);
        if (videoEl) {
            videoEl.addEventListener('enterpictureinpicture', handleEnterPiP);
            videoEl.addEventListener('leavepictureinpicture', handleLeavePiP);
        }

        player.on('play', updatePlayState);
        player.on('pause', updatePlayState);
        player.on('timeupdate', updateTime);
        player.on('timeupdate', updateBuffered);
        player.on('loadedmetadata', updateDuration);
        player.on('progress', updateBuffered);
        player.on('volumechange', updateMuted);
        player.on('ended', handleEnded);

        return () => {
            player.off('play', updatePlayState);
            player.off('pause', updatePlayState);
            player.off('timeupdate', updateTime);
            player.off('timeupdate', updateBuffered);
            player.off('loadedmetadata', updateDuration);
            player.off('progress', updateBuffered);
            player.off('volumechange', updateMuted);
            player.off('ended', handleEnded);

            if (videoEl) {
                videoEl.removeEventListener('enterpictureinpicture', handleEnterPiP);
                videoEl.removeEventListener('leavepictureinpicture', handleLeavePiP);
            }
        };
    }, [player, volume, nextItem, dismissedNextItemPrompt, item.Id, navigate, markItemAsCompleted]);

    const togglePlay = useCallback(() => {
        if (!player) return;
        if (player.paused()) {
            player.play();
        } else {
            player.pause();
        }
    }, [player]);

    const [isDragging, setIsDragging] = useState(false);
    const [dragTime, setDragTime] = useState<number | null>(null);

    const calculateTimeFromEvent = useCallback(
        (clientX: number) => {
            if (!progressRef.current || !duration) return 0;
            const rect = progressRef.current.getBoundingClientRect();
            const x = clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, x / rect.width));
            return percentage * duration;
        },
        [duration]
    );

    const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!player || !duration) return;
        setIsDragging(true);
        const newTime = calculateTimeFromEvent(e.clientX);
        setDragTime(newTime);
    };

    const handleProgressTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!player || !duration || e.touches.length === 0) return;
        setIsDragging(true);
        const newTime = calculateTimeFromEvent(e.touches[0].clientX);
        setDragTime(newTime);
    };

    // 拖拽过程中的全局事件处理（防止拖脱进度条范围）
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMoveGlobal = (e: MouseEvent) => {
            const newTime = calculateTimeFromEvent(e.clientX);
            setDragTime(newTime);
            if (progressRef.current && duration) {
                const rect = progressRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                setHoverPosition(x);
                setHoverTime(newTime);
            }
        };

        const handleMouseUpGlobal = (e: MouseEvent) => {
            const newTime = calculateTimeFromEvent(e.clientX);
            if (player) {
                player.currentTime(newTime);
            }
            setIsDragging(false);
            setDragTime(null);
            setHoverTime(null);
        };

        const handleTouchMoveGlobal = (e: TouchEvent) => {
            if (e.touches.length === 0) return;
            const newTime = calculateTimeFromEvent(e.touches[0].clientX);
            setDragTime(newTime);
            if (progressRef.current && duration) {
                const rect = progressRef.current.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                setHoverPosition(x);
                setHoverTime(newTime);
            }
        };

        const handleTouchEndGlobal = () => {
            if (dragTime !== null && player) {
                player.currentTime(dragTime);
            }
            setIsDragging(false);
            setDragTime(null);
            setHoverTime(null);
        };

        document.addEventListener('mousemove', handleMouseMoveGlobal);
        document.addEventListener('mouseup', handleMouseUpGlobal);
        document.addEventListener('touchmove', handleTouchMoveGlobal);
        document.addEventListener('touchend', handleTouchEndGlobal);

        return () => {
            document.removeEventListener('mousemove', handleMouseMoveGlobal);
            document.removeEventListener('mouseup', handleMouseUpGlobal);
            document.removeEventListener('touchmove', handleTouchMoveGlobal);
            document.removeEventListener('touchend', handleTouchEndGlobal);
        };
    }, [isDragging, calculateTimeFromEvent, duration, player, dragTime]);

    const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isDragging) return;
        if (!progressRef.current || !duration) return;
        const rect = progressRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        setHoverTime(percentage * duration);
        setHoverPosition(x);
    };

    const handleProgressLeave = () => {
        if (isDragging) return;
        setHoverTime(null);
    };

    const togglePiP = useCallback(async () => {
        if (!player) return;
        const videoEl = player.el()?.querySelector('video');
        if (!videoEl) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (document.pictureInPictureEnabled) {
                await videoEl.requestPictureInPicture();
            }
        } catch (error) {
            console.error('Error toggling PiP:', error);
        }
    }, [player]);

    const handleVolumeChange = (values: number[]) => {
        if (!player || values.length === 0) return;
        const newVolume = values[0];
        setVolume(newVolume);
        if (newVolume > 0 && isMuted) player.muted(false);
        if (newVolume === 0 && !isMuted) player.muted(true);
        player.volume(newVolume);
    };

    const toggleMute = useCallback(() => {
        if (!player) return;
        player.muted(!isMuted);
    }, [player, isMuted]);

    const toggleFullscreen = useCallback(() => {
        onFullscreenToggle?.();
    }, [onFullscreenToggle]);

    const handleAudioTrackChange = (value: string) => {
        const index = parseInt(value, 10);
        onAudioTrackChange(index);
        setLastAudioLanguage(item.Id || '', index);
    };

    const handleSubtitleTrackChange = (value: string) => {
        if (value === 'off') {
            onSubtitleTrackChange(null);
            removeLastSubtitleLanguage(item.Id || '');
        } else {
            const index = parseInt(value, 10);
            onSubtitleTrackChange(index);
            setLastSubtitleLanguage(item.Id || '', index);
        }
    };

    const getMediaSegment = (type: MediaSegmentType) => {
        if (!mediaSegments || mediaSegments.length === 0) return null;
        return mediaSegments.find((segment) => segment.Type === type) || null;
    };

    const handleSkipSegment = (type: MediaSegmentType) => {
        if (!player) return;
        const segment = getMediaSegment(type);
        if (segment?.EndTicks) {
            const endSeconds = ticksToSeconds(segment.EndTicks);
            player.currentTime(endSeconds);
        }
    };

    const handleSeekBackward = useCallback(() => {
        if (!player) return;
        const newTime = Math.max(0, (player.currentTime() || 0) - 10);
        player.currentTime(newTime);
    }, [player]);

    const handleSeekForward = useCallback(() => {
        if (!player) return;
        const newTime = Math.min(duration, (player.currentTime() || 0) + 10);
        player.currentTime(newTime);
    }, [player, duration]);

    usePlayerKeyboardControls({
        togglePlay,
        toggleMute,
        toggleFullscreen,
        togglePiP,
        handleSeekBackward,
        handleSeekForward,
    });

    const introSegment = getMediaSegment('Intro');
    const showSkipIntroButton =
        introSegment &&
        introSegment.StartTicks != null &&
        introSegment.EndTicks != null &&
        currentTime > ticksToSeconds(introSegment.StartTicks) &&
        currentTime < ticksToSeconds(introSegment.EndTicks);

    const outtroSegment = getMediaSegment('Outro');
    const showSkipOutroButton =
        outtroSegment &&
        outtroSegment.StartTicks != null &&
        outtroSegment.EndTicks != null &&
        currentTime > ticksToSeconds(outtroSegment.StartTicks) &&
        currentTime < ticksToSeconds(outtroSegment.EndTicks);

    const clampedCurrentTime = duration > 0 ? Math.min(currentTime, duration) : currentTime;
    const displayCurrentTime = dragTime !== null ? dragTime : clampedCurrentTime;
    const progressPercentage = Math.min(
        100,
        duration > 0 ? (displayCurrentTime / duration) * 100 : 0
    );
    const bufferedPercentage = Math.min(100, duration > 0 ? (bufferedTime / duration) * 100 : 0);

    const title =
        item.Type === 'Episode'
            ? `${item.SeriesName} - S${item.ParentIndexNumber}E${item.IndexNumber} - ${item.Name}`
            : item.Name;

    const audioStreams = item.MediaStreams?.filter((s) => s.Type === 'Audio') || [];
    const subtitleStreams = item.MediaStreams?.filter((s) => s.Type === 'Subtitle') || [];

    const timeRemaining = duration - currentTime;
    const showNextItemPrompt =
        nextItem &&
        duration > 0 &&
        !dismissedNextItemPrompt &&
        (timeRemaining <= 30 || // 30 sec remaining
            (duration > 0 && currentTime / duration >= 0.95)); // or 95% complete

    return (
        <>
            <div
                className="absolute top-0 left-0 w-full p-4 bg-linear-to-b from-black/80 to-transparent z-20 text-gray-200 text-lg flex items-center gap-2 transition-opacity duration-300"
                style={{
                    opacity: showControls ? 1 : 0,
                    pointerEvents: showControls ? 'auto' : 'none',
                }}
                onMouseMove={handleMouseMove}
            >
                <Button variant="ghost" asChild>
                    <Link to={`/item/${item.Id}`}>
                        <ArrowLeft />
                    </Link>
                </Button>
                <h1>{title}</h1>
            </div>
            <div
                className={`absolute inset-0 z-10 p-4 ${showControls ? '' : 'cursor-none'}`}
                onClick={togglePlay}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
            <div className="absolute bottom-28 right-8 z-30 flex gap-2">
                {showSkipIntroButton && !showNextItemPrompt && (
                    <Button
                        variant={'default'}
                        onClick={() => handleSkipSegment('Intro')}
                        className="cursor-pointer"
                        title={t('skipIntro')}
                    >
                        <SkipForward />
                        {t('skipIntro')}
                    </Button>
                )}
                {showSkipOutroButton && !showNextItemPrompt && (
                    <Button
                        variant={'default'}
                        onClick={() => handleSkipSegment('Outro')}
                        className="cursor-pointer"
                        title={t('skipOutro')}
                    >
                        <SkipForward />
                        {t('skipOutro')}
                    </Button>
                )}
                {showNextItemPrompt && (
                    <Card className="gap-2 w-60 md:w-80">
                        <CardHeader>
                            <CardTitle className="text-xl sm:text-2xl">
                                {t('upNext', {
                                    seconds: timeRemaining.toFixed(0),
                                })}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col">
                            <img
                                src={getPrimaryImageUrl(nextItem.Id!, {
                                    height: 180,
                                    width: 320,
                                })}
                                alt={nextItem.Name || 'Next item poster'}
                                className="w-full h-auto rounded mb-3 hidden sm:block"
                            />
                            <div className="flex items-center">
                                <p>
                                    {t('seasonEpisode', {
                                        season: nextItem.ParentIndexNumber,
                                        episode: nextItem.IndexNumber,
                                    })}{' '}
                                    ⋅ {nextItem.Name}
                                </p>
                            </div>
                            <div className="flex items-center text-muted-foreground text-xs mb-3">
                                <p>{ticksToReadableTime(nextItem.RunTimeTicks || 0)}</p>
                                <Dot />
                                <p>Ends at {formatPlayTime(duration)}</p>
                            </div>
                            <div className="flex items-center gap-2 w-full">
                                <Button
                                    variant={'default'}
                                    className="flex-1"
                                    onClick={() => {
                                        if (!player || !nextItem) return;
                                        player.pause();
                                        markItemAsCompleted(item.Id);
                                        navigate(`/play/${nextItem.Id}`);
                                    }}
                                >
                                    <SkipForward />
                                    {t('startNow')}
                                </Button>
                                <Button
                                    variant={'outline'}
                                    className="flex-1"
                                    onClick={() => {
                                        setDismissedNextItemPrompt(true);
                                    }}
                                >
                                    {t('dismiss')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
            <div
                className={`absolute top-18 left-8 z-30 p-4 bg-black/70 text-white text-sm rounded-md max-w-sm ${showStats && stats ? '' : 'hidden'}`}
                style={{
                    pointerEvents: showStats && stats ? 'auto' : 'none',
                }}
                onMouseEnter={handleMouseMove}
                onMouseMove={handleMouseMove}
            >
                {stats && (
                    <div>
                        <h4 className="mb-1">Playback Info</h4>
                        <div className="ml-2">
                            <p>
                                <span>Player</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.playbackInfo.player}
                                </span>
                            </p>
                            <p>
                                <span>Play method</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.playbackInfo.transcoding ? 'Transcoded' : 'Direct'}
                                </span>
                            </p>
                            <p>
                                <span>Protocol</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.playbackInfo.protocol}
                                </span>
                            </p>
                        </div>
                        <h4 className="mb-1 mt-3">Video Info</h4>
                        <div className="ml-2">
                            <p>
                                <span>Video Resolution</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.videoInfo.videoResolution.width}x
                                    {stats.videoInfo.videoResolution.height}
                                </span>
                            </p>
                            <p>
                                <span>Player Dimensions</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.videoInfo.playerDimensions.width}x
                                    {stats.videoInfo.playerDimensions.height}
                                </span>
                            </p>
                            <p>
                                <span>Dropped Frames</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.videoInfo.droppedFrames}
                                </span>
                            </p>
                            <p>
                                <span>Corrupted Frames</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.videoInfo.corruptedFrames}
                                </span>
                            </p>
                            <p>
                                <span>Total Frames</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.videoInfo.totalFrames}
                                </span>
                            </p>
                        </div>
                        <h4 className="mb-1 mt-3">Media Info</h4>
                        <div className="ml-2">
                            <p>
                                <span>Video Codec</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.videoCodec}
                                </span>
                            </p>
                            <p>
                                <span>Video Bitrate</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.videoBitrateKbps ?? 'N/A'} kbps
                                </span>
                            </p>
                            <p>
                                <span>Video Range Type</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.videoRangeType || 'N/A'}
                                </span>
                            </p>
                            <p>
                                <span>Audio Codec</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.audioCodec}
                                </span>
                            </p>
                            <p>
                                <span>Audio Bitrate</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.audioBitrateKbps ?? 'N/A'} kbps
                                </span>
                            </p>
                            <p>
                                <span>Audio Channels</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.audioChannels}
                                </span>
                            </p>
                            <p>
                                <span>Audio Sample Rate</span>{' '}
                                <span className="text-muted-foreground">
                                    {stats.mediaInfo.audioSampleRate} Hz
                                </span>
                            </p>
                        </div>
                    </div>
                )}
            </div>
            <div
                className="absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-black/80 to-transparent p-4 transition-opacity duration-300"
                style={{
                    opacity: showControls ? 1 : 0,
                    pointerEvents: showControls ? 'auto' : 'none',
                }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                {/* 播放进度条区域（上方条形，下方两端带时间） */}
                <div className="flex flex-col mb-4 select-none w-full group/progress">
                    <div
                        ref={progressRef}
                        className="w-full h-4 rounded cursor-pointer relative flex items-center"
                        onMouseDown={handleProgressMouseDown}
                        onTouchStart={handleProgressTouchStart}
                        onMouseMove={handleProgressHover}
                        onMouseLeave={handleProgressLeave}
                    >
                        {/* Actually visible bar that's smaller for better aesthetics */}
                        <div className="absolute left-0 right-0 h-1 bg-gray-600 rounded pointer-events-none z-0 transition-all group-hover/progress:h-1.5" />
                        {/* buffered progress */}
                        <div
                            className="absolute left-0 h-1 bg-gray-500 rounded pointer-events-none z-5 transition-all group-hover/progress:h-1.5"
                            style={{ width: `${bufferedPercentage}%` }}
                        />
                        {/** Bar that shows the hovered time */}
                        <div
                            className="absolute left-0 h-1 bg-white/20 rounded pointer-events-none z-10 transition-all group-hover/progress:h-1.5"
                            style={{
                                width:
                                    hoverTime !== null ? `${(hoverTime / duration) * 100}%` : '0%',
                            }}
                        />
                        {/* current progress */}
                        <div
                            className="absolute left-0 h-1 bg-brand rounded pointer-events-none z-15 transition-all group-hover/progress:h-1.5"
                            style={{ width: `${progressPercentage}%` }}
                        />
                        {/* 圆形拖动滑点 - 设为常显且在拖动时微放大 */}
                        <div
                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-brand rounded-full border border-white shadow-md pointer-events-none z-20 transition-transform duration-200 ${
                                isDragging ? 'scale-125' : 'scale-100'
                            }`}
                            style={{ left: `${progressPercentage}%` }}
                        />
                        {/* Hover preview */}
                        {hoverTime !== null &&
                            item.Trickplay &&
                            (() => {
                                const trickplayInfo = getPrimaryTrickplayInfo(item.Trickplay);
                                if (!trickplayInfo || hoverTime === null) return null;

                                const { imageIndex, x, y, width, height } = getTrickplayTile(
                                    hoverTime,
                                    trickplayInfo
                                );

                                const previewWidth = width || 320;
                                const halfWidth = previewWidth / 2;
                                const clampedPosition = Math.max(
                                    halfWidth,
                                    Math.min(hoverPosition, window.innerWidth - halfWidth)
                                );

                                return (
                                    <div
                                        className="absolute bottom-4 -translate-x-1/2 text-white pointer-events-none z-40 flex flex-col items-center"
                                        style={{ left: `${clampedPosition}px` }}
                                    >
                                        <div
                                            className="relative overflow-hidden rounded-md mb-1"
                                            style={{
                                                width: width,
                                                height: height,
                                            }}
                                        >
                                            <img
                                                src={getTrickplayImageUrl(
                                                    item.Id!,
                                                    width || 320,
                                                    imageIndex
                                                )}
                                                style={{
                                                    position: 'absolute',
                                                    left: -x * (width || 0),
                                                    top: -y * (height || 0),
                                                    maxWidth: 'none',
                                                }}
                                                draggable={false}
                                            />
                                        </div>
                                        <div className="text-center bg-black/90 p-1 px-2 rounded-md w-min">
                                            {formatPlayTime(hoverTime)}
                                        </div>
                                    </div>
                                );
                            })()}
                    </div>
                    {/* 进度条下方的两端时间显示 */}
                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1.5 px-0.5 font-medium">
                        <span className="tabular-nums">{formatPlayTime(displayCurrentTime)}</span>
                        <span className="tabular-nums">{formatPlayTime(duration)}</span>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between text-white gap-4">
                    <div className="flex items-center gap-2">
                        {previousItem && (
                            <Button
                                variant={'ghost'}
                                size={'icon-lg'}
                                className="cursor-pointer"
                                title={t('previousItem')}
                                asChild
                            >
                                <Link to={`/play/${previousItem.Id}`}>
                                    <SkipBack size={24} />
                                </Link>
                            </Button>
                        )}
                        <Button
                            variant={'ghost'}
                            size={'icon-lg'}
                            onClick={togglePlay}
                            className="cursor-pointer"
                        >
                            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                        </Button>
                        {nextItem && (
                            <Button
                                variant={'ghost'}
                                size={'icon-lg'}
                                className="cursor-pointer"
                                title={t('nextItem')}
                                asChild
                            >
                                <Link to={`/play/${nextItem.Id}`}>
                                    <SkipForward size={24} />
                                </Link>
                            </Button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant={'ghost'}
                            size={'icon-lg'}
                            onClick={() => setShowStats(!showStats)}
                            className="cursor-pointer"
                            title="Toggle Stats"
                        >
                            <Info />
                        </Button>
                        {subtitleStreams.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant={'ghost'}
                                        size={'icon-lg'}
                                        className="cursor-pointer"
                                    >
                                        <Subtitles />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent container={container}>
                                    <DropdownMenuLabel>{t('subtitles')}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuRadioGroup
                                        value={subtitleTrackIndex?.toString() || 'off'}
                                        onValueChange={handleSubtitleTrackChange}
                                    >
                                        <DropdownMenuRadioItem value="off">
                                            {t('off')}
                                        </DropdownMenuRadioItem>
                                        {subtitleStreams.map((stream, index) => (
                                            <DropdownMenuRadioItem
                                                key={index}
                                                value={index.toString()}
                                            >
                                                {stream.DisplayTitle ||
                                                    stream.Language ||
                                                    'Unknown'}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {audioStreams.length > 1 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant={'ghost'}
                                        size={'icon-lg'}
                                        className="cursor-pointer"
                                    >
                                        <AudioLines />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent container={container}>
                                    <DropdownMenuLabel>{t('audioTracks')}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuRadioGroup
                                        value={audioTrackIndex?.toString() || ''}
                                        onValueChange={handleAudioTrackChange}
                                    >
                                        {audioStreams.map((stream, index) => (
                                            <DropdownMenuRadioItem
                                                key={index}
                                                value={stream.Index!.toString()}
                                            >
                                                {stream.Language || 'Unknown Language'} -{' '}
                                                {stream.Codec}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {/* 音量控制组合区域：支持悬停/触摸滑出音量条，音量条显示时点击图标切换静音 */}
                        <div
                            className="flex items-center"
                            onMouseEnter={() => setShowVolumeBar(true)}
                            onMouseLeave={() => setShowVolumeBar(false)}
                        >
                            <Button
                                variant={'ghost'}
                                size={'icon-lg'}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (showVolumeBar) {
                                        toggleMute();
                                    } else {
                                        setShowVolumeBar(true);
                                    }
                                }}
                                className="cursor-pointer"
                            >
                                {isMuted ? <VolumeX /> : <Volume2 />}
                            </Button>
                            <div
                                className={`flex items-center transition-all duration-300 ease-in-out ${
                                    showVolumeBar
                                        ? 'w-24 opacity-100 ml-2'
                                        : 'w-0 opacity-0 overflow-hidden pointer-events-none'
                                }`}
                            >
                                <Slider
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    value={isMuted ? [0] : [volume]}
                                    onValueChange={handleVolumeChange}
                                    className="w-24 cursor-pointer"
                                />
                            </div>
                        </div>
                        {/* 播放速度控制 */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant={'ghost'}
                                    size={'icon-lg'}
                                    className="cursor-pointer text-sm font-semibold select-none"
                                    title="播放速度"
                                >
                                    <span className="text-[13px]">{playbackRate}x</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent container={container}>
                                <DropdownMenuLabel>播放速度</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuRadioGroup
                                    value={playbackRate.toString()}
                                    onValueChange={(val) => setPlaybackRate(parseFloat(val))}
                                >
                                    <DropdownMenuRadioItem value="0.5">0.5x</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="0.75">
                                        0.75x
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="1">
                                        1.0x (正常)
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="1.25">
                                        1.25x
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="1.5">1.5x</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="1.75">
                                        1.75x
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="2">2.0x</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {document.pictureInPictureEnabled && (
                            <Button
                                variant={'ghost'}
                                size={'icon-lg'}
                                onClick={togglePiP}
                                className="cursor-pointer"
                                title="Picture in Picture"
                            >
                                <PictureInPicture2
                                    size={20}
                                    className={isPiP ? 'text-brand' : ''}
                                />
                            </Button>
                        )}
                        <Button
                            variant={'ghost'}
                            size={'icon-lg'}
                            onClick={toggleFullscreen}
                            className="cursor-pointer"
                        >
                            {isFullscreen ? <Minimize /> : <Maximize />}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default PlayerControls;
