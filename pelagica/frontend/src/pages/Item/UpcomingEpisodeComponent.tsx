import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { Badge } from '../../components/ui/badge';
import { memo } from 'react';
import { Calendar } from 'lucide-react';
import type { TFunction } from 'i18next';

const UpcomingEpisodeComponent = memo(
    ({ episode, className, t }: { episode: BaseItemDto; className?: string; t: TFunction }) => {
        const hasProperName =
            episode.Name && episode.Name !== '' && episode.Name.toLowerCase() !== 'tba';
        const title = hasProperName
            ? episode.Name
            : t('season_episode', {
                  season: episode.ParentIndexNumber,
                  episode: episode.IndexNumber,
              }) || t('no_title');

        return (
            <div className={'group ' + className}>
                <div className="relative w-full aspect-video rounded-md overflow-hidden border-2 border-dashed border-muted-foreground/30 bg-muted/30 flex flex-col items-center justify-center gap-1.5">
                    <Calendar className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-lg text-muted-foreground font-bold text-center">{title}</p>
                    {episode.PremiereDate && (
                        <p className="text-xs text-muted-foreground/70 font-medium">
                            {new Date(episode.PremiereDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    {episode.IndexNumber !== undefined && (
                        <Badge
                            variant={'outline'}
                            className="text-muted-foreground/50 border-muted-foreground/30"
                        >
                            S{episode.ParentIndexNumber} E{episode.IndexNumber}
                        </Badge>
                    )}
                    {episode.PremiereDate && (
                        <Badge
                            variant={'outline'}
                            className="text-muted-foreground/50 border-muted-foreground/30"
                        >
                            {new Date(episode.PremiereDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </Badge>
                    )}
                </div>
            </div>
        );
    }
);

export default UpcomingEpisodeComponent;
