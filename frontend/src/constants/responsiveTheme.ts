/**
 * Responsive theme values for different screen sizes
 * Base values for small phones, adjust upward for larger screens
 */

export const ResponsiveSpacing = {
  // Small phones (<390px)
  xs: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  // Medium phones (390-430px)
  sm: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  // Large phones (430-600px)
  md: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
    xxl: 36,
  },
  // Tablets (600px+)
  lg: {
    xs: 10,
    sm: 14,
    md: 18,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  // Desktop (960px+)
  xl: {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 28,
    xl: 36,
    xxl: 48,
  },
};

export const ResponsiveFontSize = {
  // Small phones
  xs: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  // Medium phones
  sm: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 21,
    xxl: 26,
    xxxl: 32,
  },
  // Large phones
  md: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 34,
  },
  // Tablets
  lg: {
    xs: 13,
    sm: 15,
    md: 17,
    lg: 19,
    xl: 24,
    xxl: 30,
    xxxl: 36,
  },
  // Desktop
  xl: {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 26,
    xxl: 32,
    xxxl: 40,
  },
};

export const ResponsiveLayout = {
  // Small phones - optimize for narrow screens
  xs: {
    maxContainerWidth: '100%',
    containerPadding: 16,
    cardGap: 8,
    gridColumns: 1,
    minTouchTarget: 48,
    modalPadding: 16,
  },
  // Medium phones
  sm: {
    maxContainerWidth: '100%',
    containerPadding: 16,
    cardGap: 10,
    gridColumns: 1,
    minTouchTarget: 48,
    modalPadding: 16,
  },
  // Large phones - can fit 2 columns
  md: {
    maxContainerWidth: '100%',
    containerPadding: 20,
    cardGap: 12,
    gridColumns: 2,
    minTouchTarget: 48,
    modalPadding: 20,
  },
  // Tablets - wider space
  lg: {
    maxContainerWidth: 800,
    containerPadding: 24,
    cardGap: 16,
    gridColumns: 2,
    minTouchTarget: 48,
    modalPadding: 24,
  },
  // Desktop - full width
  xl: {
    maxContainerWidth: 1000,
    containerPadding: 32,
    cardGap: 20,
    gridColumns: 3,
    minTouchTarget: 44,
    modalPadding: 32,
  },
};

/**
 * Get responsive values based on screen width
 */
export function getResponsiveTheme(width: number) {
  if (width < 390) return { spacing: ResponsiveSpacing.xs, fontSize: ResponsiveFontSize.xs, layout: ResponsiveLayout.xs };
  if (width < 430) return { spacing: ResponsiveSpacing.sm, fontSize: ResponsiveFontSize.sm, layout: ResponsiveLayout.sm };
  if (width < 600) return { spacing: ResponsiveSpacing.md, fontSize: ResponsiveFontSize.md, layout: ResponsiveLayout.md };
  if (width < 960) return { spacing: ResponsiveSpacing.lg, fontSize: ResponsiveFontSize.lg, layout: ResponsiveLayout.lg };
  return { spacing: ResponsiveSpacing.xl, fontSize: ResponsiveFontSize.xl, layout: ResponsiveLayout.xl };
}
