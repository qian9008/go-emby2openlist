import { getUnauthenticatedApi } from '@/api/getApi';
import { getBrandingApi } from '@jellyfin/sdk/lib/utils/api/branding-api';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../utils/localstorageCredentials';

export function useServerBranding() {
    const server = getServerUrl();

    return useQuery({
        queryKey: ['serverBranding'],
        enabled: !!server,
        queryFn: async () => {
            const api = getUnauthenticatedApi();
            const brandingApi = getBrandingApi(api);
            const branding = await brandingApi.getBrandingOptions();
            return branding.data;
        },
        staleTime: 30000,
    });
}
