import type { AppConfig } from '@/hooks/api/useConfig';
import { useTitleDisplayMode, getItemDisplayName } from '@/hooks/useTitleDisplayMode';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import BaseMediaPage from './BaseMediaPage';
import DetailBadges from './DetailBadges';
import { Skeleton } from '@/components/ui/skeleton';
import { getPrimaryImageUrl } from '@/utils/jellyfinUrls';
import { useState } from 'react';
import { useBoxSetItems } from '@/hooks/api/useBoxSetItems';
import SectionScroller from '@/components/SectionScroller';
import { useTranslation } from 'react-i18next';
import ScrollableSectionPoster from '@/components/ScrollableSectionPoster';
import ItemAdminButton from '@/components/ItemAdminButton';
import { ImageOff } from 'lucide-react';

interface BoxSetPageProps {
    item: BaseItemDto;
    config: AppConfig;
}

const BoxSetPage = ({ item, config }: BoxSetPageProps) => {
    const { t } = useTranslation('item');
    const [primaryImageError, setPrimaryImageError] = useState(false);
    const { data: boxSetItems } = useBoxSetItems(item.Id || '');
    const [titleMode] = useTitleDisplayMode();

    const isLandscape = item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 1;

    return (
        <BaseMediaPage
            itemId={item.Id || ''}
            name={item.Name || ''}
            showLogo={false}
            topPadding={false}
        >
            <div className="flex flex-col md:flex-row gap-6 max-w-7xl">
                {!primaryImageError && item.Id ? (
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
                            onError={() => setPrimaryImageError(true)}
                        />
                        <Skeleton className="absolute inset-0 w-full h-full rounded-md -z-1" />
                    </div>
                ) : item.Id ? (
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
                ) : null}
                <div className="flex flex-col gap-3">
                    <h2 className="text-4xl sm:text-5xl font-bold mt-2">
                        {getItemDisplayName(item, titleMode)}
                    </h2>
                    <DetailBadges item={item} appConfig={config} />
                    <ItemAdminButton item={item} />
                    <p>{item.Overview}</p>
                </div>
            </div>
            <SectionScroller
                title={<h3 className="text-3xl font-bold">{t('boxSetItems')}</h3>}
                items={
                    boxSetItems?.map((boxSetItem) => {
                        return (
                            <ScrollableSectionPoster key={boxSetItem.Id} item={boxSetItem}>
                                {boxSetItem.PremiereDate && (
                                    <span className="text-xs text-muted-foreground mt-1">
                                        {new Date(boxSetItem.PremiereDate).getFullYear()}
                                    </span>
                                )}
                            </ScrollableSectionPoster>
                        );
                    }) ||
                    Array.from({ length: 10 }, (_, i) => (
                        <div
                            key={i}
                            className="group min-w-48 lg:min-w-64 2xl:min-w-80 animate-pulse"
                        >
                            <Skeleton className="w-full aspect-video rounded-md" />
                            <Skeleton className="mt-2 h-4 w-3/4 rounded-md" />
                        </div>
                    ))
                }
            />
        </BaseMediaPage>
    );
};

export default BoxSetPage;
