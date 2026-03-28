import { useWindowDimensions } from 'react-native';

/**
 * Responsive design utilities for mobile and web
 * Handles all screen sizes: phones, tablets, and web browsers
 */

// Screen size breakpoints
export const BREAKPOINTS = {
  xs: 0,      // Small phones (iPhone SE, etc)
  sm: 390,    // Medium phones (iPhone 12, etc)
  md: 430,    // Large phones (iPhone 14 Pro Max)
  lg: 600,    // Tablets (iPad mini)
  xl: 960,    // iPad/Tablets
  xxl: 1280,  // Desktop
} as const;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return {
    width,
    height,
    isSmallPhone: width < 390,
    isMediumPhone: width >= 390 && width < 430,
    isLargePhone: width >= 430 && width < 600,
    isTablet: width >= 600 && width < 960,
    isDesktop: width >= 960,
    isPortrait: height > width,
    isLandscape: width > height,
    // Helper for specific breakpoint checks
    isSize: (breakpoint: keyof typeof BREAKPOINTS) => {
      const sizes = BREAKPOINTS;
      const current = sizes[breakpoint];
      const next = Object.values(sizes)[Object.keys(sizes).indexOf(breakpoint) + 1] || Infinity;
      return width >= current && width < next;
    },
  };
}

/**
 * Get responsive value based on screen width
 * Usage: getResponsiveValue(10, 12, 14, 16) for xs, sm, md, lg+
 */
export function getResponsiveValue(
  xsValue: number,
  smValue: number,
  mdValue: number,
  lgValue: number
): (width: number) => number {
  return (width: number) => {
    if (width < BREAKPOINTS.sm) return xsValue;
    if (width < BREAKPOINTS.md) return smValue;
    if (width < BREAKPOINTS.lg) return mdValue;
    return lgValue;
  };
}

/**
 * Responsive padding/spacing helper
 * Returns appropriate spacing for current screen size
 */
export function getResponsiveSpacing(width: number) {
  if (width < BREAKPOINTS.sm) return { xs: 8, sm: 12, md: 16, lg: 20 };     // Small phone
  if (width < BREAKPOINTS.md) return { xs: 10, sm: 14, md: 18, lg: 24 };    // Medium phone
  if (width < BREAKPOINTS.lg) return { xs: 12, sm: 16, md: 20, lg: 28 };    // Large phone
  if (width < BREAKPOINTS.xl) return { xs: 14, sm: 18, md: 24, lg: 32 };    // Tablet
  return { xs: 16, sm: 20, md: 28, lg: 36 };                                 // Desktop
}

/**
 * Responsive font size helper
 */
export function getResponsiveFontSize(width: number) {
  if (width < BREAKPOINTS.sm) {
    return { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 26 };
  }
  if (width < BREAKPOINTS.md) {
    return { xs: 11, sm: 13, md: 15, lg: 17, xl: 21, xxl: 28 };
  }
  if (width < BREAKPOINTS.lg) {
    return { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 30 };
  }
  return { xs: 13, sm: 15, md: 17, lg: 19, xl: 24, xxl: 32 };
}

/**
 * Number of columns for grid layouts
 */
export function getGridColumns(width: number): number {
  if (width < BREAKPOINTS.md) return 1;  // Single column on phones
  if (width < BREAKPOINTS.lg) return 2;  // Two columns on large phones
  if (width < BREAKPOINTS.xl) return 2;  // Two columns on tablets
  return 3;                               // Three columns on desktop
}

/**
 * Modal max width for responsive layouts
 */
export function getModalMaxWidth(width: number): number | string {
  if (width < BREAKPOINTS.lg) return '90%';
  if (width < BREAKPOINTS.xl) return '80%';
  return 600;
}

/**
 * Card width for responsive grids
 */
export function getCardWidth(width: number, columns: number = 2): number {
  const padding = width < 390 ? 28 : width < 430 ? 32 : 40; // Horizontal padding
  return (width - padding) / columns;
}

/**
 * Safe area padding for notches (iPhone, Android)
 */
export function getSafeAreaPadding(width: number) {
  if (width < BREAKPOINTS.md) return 16; // Small padding on phones
  if (width < BREAKPOINTS.lg) return 20; // Medium padding
  return 24;                              // Larger padding on tablets
}

/**
 * Minimum touch target size (accessibility)
 * Should be at least 44-48px on all platforms
 */
export const MIN_TOUCH_TARGET = 48;

/**
 * Container max width for better reading on large screens
 */
export function getContainerMaxWidth(width: number): number | string {
  if (width < BREAKPOINTS.lg) return '100%';
  if (width < BREAKPOINTS.xl) return 800;
  return 1000;
}
