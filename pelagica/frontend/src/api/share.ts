import { getAccessToken } from '@/utils/localstorageCredentials';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';

export interface ShareUser {
    Id: string;
    Name: string;
}

export interface ShareItem {
    id: number;
    media_id: string;
    media_name: string;
    owner_user_id: string;
    owner_username: string;
    target_user_id: string;
    target_username: string;
    created_at: string;
    expire_at: string | null;
    status: number;
}

export interface PagedResponse<T> {
    TotalRecordCount: number;
    Items: T[];
}

export interface SimpleResponse {
    success: boolean;
    msg: string;
}

// 构造请求头，支持 api_key
function getHeaders(): Record<string, string> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['X-Emby-Token'] = token;
        headers['Authorization'] = `MediaBrowser Client="Pelagica", Device="Web", DeviceId="web-device", Version="1.0.0", Token="${token}"`;
    }
    return headers;
}

// 1. 获取所有可分享的用户列表
export async function fetchShareUsers(): Promise<ShareUser[]> {
    try {
        const response = await fetch('/api/share/users', {
            headers: getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch share users: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('Share backend not reachable or disabled:', error);
        return [];
    }
}

// 2. 创建分享关系
export async function createShare(mediaId: string, targets: string[]): Promise<SimpleResponse> {
    try {
        const response = await fetch('/api/share/create', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ media_id: mediaId, targets }),
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return {
                success: false,
                msg: errData.msg || `分享请求失败: ${response.statusText}`,
            };
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to create share:', error);
        return {
            success: false,
            msg: '无法连接到分享后台服务，请检查后端运行状态',
        };
    }
}

// 3. 获取我发起的分享 (分页)
export async function fetchMyShares(startIndex = 0, limit = 20): Promise<PagedResponse<ShareItem>> {
    try {
        const response = await fetch(`/api/share/mine?StartIndex=${startIndex}&Limit=${limit}`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch my shares: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to fetch my shares from backend:', error);
        return { TotalRecordCount: 0, Items: [] };
    }
}

// 4. 获取共享给我的视频列表 (分页)
export async function fetchSharedWithMe(startIndex = 0, limit = 20): Promise<PagedResponse<BaseItemDto & { ShareOwnerName?: string }>> {
    try {
        const response = await fetch(`/api/share/shared-with-me?StartIndex=${startIndex}&Limit=${limit}`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch shared with me items: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to fetch shared items from backend:', error);
        return { TotalRecordCount: 0, Items: [] };
    }
}

// 5. 取消分享
export async function deleteShare(id: number): Promise<SimpleResponse> {
    try {
        const response = await fetch(`/api/share/${id}`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return {
                success: false,
                msg: errData.msg || `取消分享失败: ${response.statusText}`,
            };
        }
        return await response.json();
    } catch (error) {
        console.warn(`Failed to delete share ${id}:`, error);
        return {
            success: false,
            msg: '操作失败，无法连接分享后台',
        };
    }
}
