# Lint and TypeScript Compilation Fixes Plan

This plan details the fixes for the current TypeScript and ESLint errors in the Pelagica frontend.

## User Review Required

No major architectural changes are proposed. The fixes are mechanical and aim to resolve compilation failures and standard react hook / unused variable lint warnings.

## Open Questions

None at this stage.

## Proposed Changes

### Frontend Component Fixes

---

#### [MODIFY] [SeriesPage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/SeriesPage.tsx)
- Change `onValueChange={(value) => setSelectedSeason(value || null)}` to `onValueChange={(value) => setSelectedSeason(value || '')}`.
- This ensures the value passed to `setSelectedSeason` is always a `string`, matching the React state type.

---

#### [MODIFY] [ExternalPlayerButton.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/ExternalPlayerButton.tsx)
- Truncate unused parameter lists from player options `getUrl` callbacks to satisfy `@typescript-eslint/no-unused-vars`.
- Remove the `useEffect` and initialize the `os` state directly using a lazy initializer function to resolve `react-hooks/set-state-in-effect`.

---

#### [MODIFY] [ShareDialog.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/ShareDialog.tsx)
- Move the `loadUsers` function declaration above the `useEffect` block that calls it to resolve the "Cannot access variable before it is declared" reference error.
- Remove synchronous state updates inside the effect (e.g. wrap with `setTimeout` or adjust dependencies).

---

#### [MODIFY] [LibraryItem.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Library/LibraryItem.tsx)
- Move nested React components (`FolderWrapper`, `FolderCornerIndicator`, `ProgressBar`) outside of the main component render function, or convert them into standard helper functions returning JSX elements (e.g., `{renderProgressBar()}`) to avoid `react-hooks/static-components`.

---

#### [MODIFY] [LibraryPage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Library/LibraryPage.tsx)
- Fix the `react-hooks/set-state-in-effect` warning on `setPageSize` in the `useEffect`.

---

#### [MODIFY] [SharedLibraryPage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/SharedLibrary/SharedLibraryPage.tsx)
- Fix `react-hooks/set-state-in-effect` warnings for `setPageSize` and `loadMyShares`.

## Verification Plan

### Automated Tests
- Run `pnpm run build` inside `pelagica/frontend` to verify TypeScript compile success.
- Run `pnpm run lint` inside `pelagica/frontend` to verify ESLint cleanliness.