import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import Page from '../Page';
import { fetchSharedWithMe } from '@/api/share';
import LibraryItem from '../Library/LibraryItem';
import ItemPagination from '@/components/ItemPagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import {
    LayoutGrid,
    Image as ImageIcon,
    List,
    FolderHeart,
} from 'lucide-react';
import { getPrimaryImageUrl, getBackdropUrl } from '@/utils/jellyfinUrls';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';

type ViewMode = 'poster' | 'backdrop' | 'list';

const ITEM_ROWS = 5;

function getColumnCount(width: number, viewMode: ViewMode): number {
    if (viewMode === 'list') return 1;
    if (viewMode === 'backdrop') {
        if (width >= 1536) return 6; // 2xl
        if (width >= 1280) return 5; // xl
        if (width >= 1024) return 4; // lg
        if (width >= 768) return 3; // md
        return 2;
    }
    // poster (default)
    if (width >= 1536) return 9; // 2xl
    if (width >= 1280) return 7; // xl
    if (width >= 1024) return 5; // lg
    if (width >= 768) return 4; // md
    if (width >= 640) return 3; // sm
    return 2;
}

export default function SharedLibraryPage() {
    const { t } = useTranslation(['library', 'common']);
    const [searchParams, setSearchParams] = useSearchParams();

    // View Mode
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('pelagica_shared_view_mode');
            return (saved as ViewMode) || 'poster';
        }
        return 'poster';
    });

    const pageParam = parseInt(searchParams.get('page') ?? '0', 10);
    const [page, setPage] = useState<number>(Number.isNaN(pageParam) ? 0 : pageParam);
    const [pageSize, setPageSize] = useState(
        () => getColumnCount(typeof window !== 'undefined' ? window.innerWidth : 640, viewMode) * ITEM_ROWS
    );

    // Data States
    const [items, setItems] = useState<(BaseItemDto & { ShareOwnerName?: string })[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Sync Page size with resize
    useEffect(() => {
        const handleResize = () => {
            const newPageSize = getColumnCount(window.innerWidth, viewMode) * ITEM_ROWS;
            setPageSize(newPageSize);
            setPage(0);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [viewMode]);

    useEffect(() => {
        const newPageSize = getColumnCount(typeof window !== 'undefined' ? window.innerWidth : 640, viewMode) * ITEM_ROWS;
        setPageSize(newPageSize);
        setPage(0);
    }, [viewMode]);

    // Fetch data
    useEffect(() => {
        let active = true;
        async function loadData() {
            setIsLoading(true);
            try {
                const res = await fetchSharedWithMe(page * pageSize, pageSize);
                if (active) {
                    setItems(res.Items || []);
                    setTotalCount(res.TotalRecordCount || 0);
                }
            } catch (err) {
                console.error('Failed to load shared with me items:', err);
                if (active) {
                    setItems([]);
                    setTotalCount(0);
                }
            } finally {
                if (active) setIsLoading(false);
            }
        }
        loadData();
        return () => {
            active = false;
        };
    }, [page, pageSize]);

    // Sync URL search params
    useEffect(() => {
        setSearchParams({
            page: String(page),
        });
    }, [page, setSearchParams]);

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        setPage(0);
        if (typeof window !== 'undefined') {
            localStorage.setItem('pelagica_shared_view_mode', mode);
        }
    };

    const posterUrls = useMemo(() => {
        return items.reduce(
            (acc, item) => {
                if (viewMode === 'backdrop' || viewMode === 'list') {
                    if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
                        acc[item.Id!] = getBackdropUrl(
                            item.Id!,
                            { width: 640, height: 360 },
                            item.BackdropImageTags[0]
                        );
                    } else if (item.ImageTags?.Backdrop) {
                        acc[item.Id!] = getBackdropUrl(
                            item.Id!,
                            { width: 640, height: 360 },
                            item.ImageTags.Backdrop
                        );
                    } else {
                        acc[item.Id!] = getPrimaryImageUrl(
                            item.Id!,
                            { width: 640 },
                            item.ImageTags?.Primary
                        );
                    }
                } else {
                    acc[item.Id!] = getPrimaryImageUrl(
                        item.Id!,
                        {
                            height: 640,
                            width: 416,
                        },
                        item.ImageTags?.Primary
                    );
                }
                return acc;
            },
            {} as Record<string, string>
        );
    }, [items, viewMode]);

    const totalPages = Math.ceil(totalCount / pageSize);

    const gridClasses = useMemo(() => {
        if (viewMode === 'list') {
            return 'w-full gap-3 mt-2 grid grid-cols-1';
        }
        if (viewMode === 'backdrop') {
            return 'w-full gap-4 mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
        }
        return 'w-full gap-4 mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9';
    }, [viewMode]);

    return (
        <Page title={t('shared_library', '共享库')} requiresAuth className="flex-1">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold flex items-center gap-2">
                        <FolderHeart className="h-8 w-8 text-primary" />
                        <span>{t('shared_library', '共享库')}</span>
                    </h2>

                    {/* View Modes Switcher */}
                    <ButtonGroup>
                        <Button
                            variant={viewMode === 'poster' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleViewModeChange('poster')}
                            title={t('view_poster', '海报网格')}
                            className="h-8 px-3 cursor-pointer"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'backdrop' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleViewModeChange('backdrop')}
                            title={t('view_backdrop', '横版网格')}
                            className="h-8 px-3 cursor-pointer"
                        >
                            <ImageIcon className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleViewModeChange('list')}
                            title={t('view_list', '列表模式')}
                            className="h-8 px-3 cursor-pointer"
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </ButtonGroup>
                </div>

                {isLoading && (
                    <div className={gridClasses}>
                        {Array.from({ length: pageSize }).map((_, i) => (
                            <div key={i} className="w-full">
                                {viewMode === 'list' ? (
                                    <div className="p-3 border rounded-lg bg-card flex gap-4 items-center w-full">
                                        <Skeleton className="w-[160px] h-[90px] rounded-md shrink-0 aspect-video" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-5 w-1/3" />
                                            <Skeleton className="h-4 w-1/4" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-0 m-0">
                                        <div
                                            className={`relative w-full aspect-${
                                                viewMode === 'backdrop' ? 'video' : '2/3'
                                            } overflow-hidden rounded-md`}
                                        >
                                            <Skeleton className="w-full h-full" />
                                        </div>
                                        <Skeleton className="mt-2 h-4 w-3/4" />
                                        <Skeleton className="mt-1 h-3 w-1/4" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {!isLoading && items.length === 0 && (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <FolderHeart className="h-12 w-12 text-muted-foreground/60" />
                            </EmptyMedia>
                            <EmptyTitle>{t('no_shared_items', '共享库为空')}</EmptyTitle>
                            <EmptyDescription>
                                {t('no_shared_items_desc', '其他用户分享给你的视频将会在这里显示。')}
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}

                {!isLoading && items.length > 0 && (
                    <>
                        <div className={gridClasses}>
                            {items.map((item) => (
                                <LibraryItem
                                    key={item.Id}
                                    item={item}
                                    posterUrl={posterUrls[item.Id!]}
                                    t={t}
                                    layoutMode={viewMode === 'list' ? 'list' : 'grid'}
                                    posterAspectRatio={
                                        viewMode === 'backdrop' ? 'video' : '2/3'
                                    }
                                    detailLine={
                                        item.PremiereDate
                                            ? new Date(item.PremiereDate).getFullYear()
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                        {totalPages > 1 && (
                            <ItemPagination
                                totalPages={totalPages}
                                currentPage={page}
                                onPageChange={setPage}
                            />
                        )}
                    </>
                )}
            </div>
        </Page>
    );
}
