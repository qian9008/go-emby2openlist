import { getAccessToken, getServerUrl } from '@/utils/localstorageCredentials';
import { useQuery } from '@tanstack/react-query';

export interface StudioSummary {
    id: string;
    name: string;
    count: number;
    hasThumb?: boolean;
}

export function useStudiosByItemCount(limit: number = 20, hasThumb: boolean = true) {
    return useQuery({
        queryKey: ['studios', 'byItemCount', limit, hasThumb],
        queryFn: async () => {
            const server = getServerUrl();
            const token = getAccessToken();

            if (!server || !token) {
                return [] as StudioSummary[];
            }

            const params = new URLSearchParams({
                jellyfin_url: server,
                limit: String(limit),
                hasThumb: String(hasThumb),
            });

            try {
                const response = await fetch(`/api/studios?${params.toString()}`, {
                    headers: {
                        Authorization: token,
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch studios');
                }

                return (await response.json()) as StudioSummary[];
            } catch (error) {
                console.warn('Failed to fetch studios:', error);
                return [] as StudioSummary[];
            }
        },
    });
}
