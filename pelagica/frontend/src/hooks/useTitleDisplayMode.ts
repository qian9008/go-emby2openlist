import { useState, useEffect } from 'react';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';

export type TitleDisplayMode = 'filename' | 'title';

const STORAGE_KEY = 'mediaTitleDisplayMode';

/**
 * 智能获取媒体项目名称或文件名
 * @param item 媒体 Dto
 * @param mode 显示模式 ('filename' | 'title')
 * @returns 最终展示的名称
 */
export const getItemDisplayName = (item: BaseItemDto, mode: TitleDisplayMode) => {
    if (mode === 'filename') {
        const path = item.Path || item.MediaSources?.[0]?.Path || (item as any).FileName;
        if (path) {
            // 支持 Windows 和 Unix 路径分隔符提取文件名
            const parts = path.split(/[/\\]/);
            const filename = parts[parts.length - 1];
            if (filename) return filename;
        }
    }
    return item.Name || '';
};

/**
 * 用户本地存储的标题/文件名显示模式 Hook
 */
export function useTitleDisplayMode() {
    const [mode, setMode] = useState<TitleDisplayMode>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        // 默认改为显示文件名 ('filename')
        return (saved as TitleDisplayMode) || 'filename';
    });

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                setMode((e.newValue as TitleDisplayMode) || 'filename');
            }
        };

        const handleCustomChange = (e: CustomEvent<TitleDisplayMode>) => {
            setMode(e.detail);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('titleDisplayModeChanged', handleCustomChange as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('titleDisplayModeChanged', handleCustomChange as EventListener);
        };
    }, []);

    const changeMode = (newMode: TitleDisplayMode) => {
        localStorage.setItem(STORAGE_KEY, newMode);
        setMode(newMode);
        // 触发自定义事件在同窗口下即时同步多组件状态
        window.dispatchEvent(new CustomEvent('titleDisplayModeChanged', { detail: newMode }));
    };

    return [mode, changeMode] as const;
}
