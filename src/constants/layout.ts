// Tab bar height + its vertical padding (see MainTabs.tsx). The tab bar is absolutely positioned
// (required for the BlurView glass effect to render "under" scrolling content), so every tab-root
// screen must add this to its scrollable content's bottom padding or its last item renders
// underneath the blurred bar instead of above it.
export const TAB_BAR_CLEARANCE = 60 + 8;
