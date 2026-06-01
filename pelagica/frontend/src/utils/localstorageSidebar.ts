const STORAGE_KEY = 'pelagica_sidebar_state';
const LIBRARY_COLLAPSIBLE_KEY = 'pelagica_library_collapsible_state';

export function saveSidebarState(isOpen: boolean) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen }));
    } catch (error) {
        console.error('Failed to save sidebar state:', error);
    }
}

export function getSidebarState(): boolean | null {
    try {
        const storedState = localStorage.getItem(STORAGE_KEY);
        if (storedState) {
            const parsedState = JSON.parse(storedState);
            return parsedState.isOpen;
        }
    } catch (error) {
        console.error('Failed to retrieve sidebar state:', error);
    }
    return null;
}

export function clearSidebarState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear sidebar state:', error);
    }
}

export function saveLibraryCollapsibleState(isOpen: boolean) {
    try {
        localStorage.setItem(LIBRARY_COLLAPSIBLE_KEY, JSON.stringify(isOpen));
    } catch (error) {
        console.error('Failed to save library collapsible state:', error);
    }
}

export function getLibraryCollapsibleState(): boolean {
    try {
        const stored = localStorage.getItem(LIBRARY_COLLAPSIBLE_KEY);
        if (stored !== null) return JSON.parse(stored);
    } catch (error) {
        console.error('Failed to retrieve library collapsible state:', error);
    }
    return true; // default to open
}
