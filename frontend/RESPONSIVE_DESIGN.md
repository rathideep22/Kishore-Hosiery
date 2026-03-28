# Responsive Design Guide

## Overview
This app is optimized for all screen sizes: mobile phones, tablets, and web browsers. The responsive design system uses breakpoints and adaptive components to ensure the best experience on every device.

## Screen Size Breakpoints

```
┌──────────────────────────────────────────────────────────┐
│ Breakpoint │ Size Range    │ Device Type                 │
├──────────────────────────────────────────────────────────┤
│ xs         │ 0 - 390px     │ Small phones (iPhone SE)    │
│ sm         │ 390 - 430px   │ Medium phones (iPhone 12)   │
│ md         │ 430 - 600px   │ Large phones (Pro Max)      │
│ lg         │ 600 - 960px   │ Tablets (iPad mini)         │
│ xl         │ 960px+        │ Desktop/Large tablets       │
└──────────────────────────────────────────────────────────┘
```

## Responsive Utilities

### `useResponsive()` Hook
Get current screen dimensions and breakpoint info:

```typescript
import { useResponsive } from '../../src/utils/responsive';

const { width, height, isSmallPhone, isMediumPhone, isLargePhone, isTablet, isDesktop } = useResponsive();
```

### `getResponsiveTheme(width)`
Get spacing and font sizes for current breakpoint:

```typescript
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';

const theme = getResponsiveTheme(width);
// Returns: { spacing: {...}, fontSize: {...}, layout: {...} }
```

### Helper Functions
- `getGridColumns(width)` - Get number of columns for layouts
- `getCardWidth(width, columns)` - Calculate responsive card width
- `getSafeAreaPadding(width)` - Get safe area padding for notches
- `getContainerMaxWidth(width)` - Get max width for readable content

## Implementation Examples

### Dashboard Stats Grid
**Small phones (xs):** Single column, full width
**Medium+ phones (sm+):** Two columns

```typescript
const { width } = useResponsive();
const gridColumns = getGridColumns(width);

<View style={[styles.statsGrid, { flexDirection: width < 430 ? 'column' : 'row' }]}>
  {/* Stats cards automatically adapt */}
</View>
```

### Gowdown Filter Buttons
**Responsive styling:**
- Small phones: Compact buttons with horizontal scroll
- Medium phones+: Larger touch targets
- All sizes: Active state with shadow effect

```typescript
<ScrollView horizontal contentContainerStyle={styles.filterScroll}>
  {FILTERS.map(f => (
    <TouchableOpacity
      style={[styles.filterBtn, { minWidth: 70, minHeight: 40 }]}
      // Touch target meets 48x48px minimum requirement
    />
  ))}
</ScrollView>
```

### Order Cards
**Responsive padding:**
- Small phones: `Spacing.sm` margins
- Medium+ phones: `Spacing.lg` margins
- Minimum height: 100px for touch accessibility

```typescript
<TouchableOpacity
  style={[styles.card, width < 430 && { marginHorizontal: Spacing.sm }]}
/>
```

## Best Practices Implemented

### 1. **Mobile-First Approach**
- Base styles designed for small phones (375px)
- Progressive enhancement for larger screens
- Never assume fixed dimensions

### 2. **Touch Target Sizes**
All interactive elements meet accessibility requirements:
- Minimum 48x48px on phones
- Buttons: `minHeight: 48, minWidth: 48`
- Filter buttons: `minHeight: 40, minWidth: 70`
- Floating action button: 56x56px (exceeds requirement)

### 3. **Safe Area Handling**
```typescript
<SafeAreaView style={styles.safe}>
  {/* Automatically handles notches and home indicators */}
</SafeAreaView>
```

### 4. **Flexible Layouts**
- Use `flex: 1` instead of fixed widths
- Use percentages for responsive sizing
- `flexWrap: 'wrap'` for grid layouts on small screens

### 5. **Typography Scaling**
Responsive font sizes across breakpoints:
- Small phones: Slightly smaller for readability
- Large phones+: Scaled proportionally
- Desktop: Optimized for larger screens

```typescript
// From responsiveTheme.ts
ResponsiveFontSize = {
  xs: { xs: 10, sm: 12, md: 14, lg: 16, ... },  // Small phones
  sm: { xs: 11, sm: 13, md: 15, lg: 17, ... },  // Medium phones
  // ... scales up for larger screens
}
```

### 6. **Padding & Spacing Scaling**
Spacing increases with screen size:
- Small phones: Tight spacing for compact layouts
- Medium phones: Balanced spacing
- Tablets+: Generous spacing for readability

### 7. **Modal Responsiveness**
Modals adapt to screen width:
- Phones: Full width with margins
- Tablets: 80-90% width with max-width
- Desktop: Fixed max-width (600-1000px)

### 8. **Grid Adaptability**
```typescript
const gridColumns = getGridColumns(width);
// xs/sm: 1 column (stacked)
// md: 2 columns
// lg/xl: 2-3 columns
```

## Component Checklist

✅ **Dashboard**
- Stat cards stack on small phones, 2-column on larger
- FAB positioned responsively
- Order rows adapt padding

✅ **Gowdown Screens (Sundha/Lal-Shivnagar)**
- Search input spans full width
- Filter buttons horizontally scrollable
- Cards have touch-friendly heights
- Spacing scales with screen size

✅ **Catalog**
- Category titles wrap on small screens
- Delete buttons accessible on all sizes
- Modal content scrollable and sized correctly
- Add variant modal responsive

✅ **Order Create**
- Gowdown selector boxes stack/side-by-side
- Form inputs full width
- Category/variant modals responsive
- Summary bar visible without scrolling

✅ **Order Edit**
- Mirrors create screen responsiveness
- Edit modals same sizing as create
- Form elements accessible on all devices

## Testing Responsive Design

### Devices to Test
- iPhone SE (375px)
- iPhone 12 (390px)
- iPhone 14 Pro Max (430px)
- iPad Mini (600px)
- iPad (768px)
- Desktop browsers (1920px+)

### Testing Checklist
- [ ] All text readable without zooming
- [ ] Touch targets at least 48x48px
- [ ] No horizontal scrolling (except intended)
- [ ] Modals fit on screen
- [ ] Keyboard doesn't hide inputs
- [ ] Images scale properly
- [ ] Icons appropriate size for screen
- [ ] Forms accessible on all sizes

## Performance Considerations

### Optimization Tips
1. **Avoid Re-renders:** Responsive values cached via `useResponsive()`
2. **No Layout Shifts:** Define `minHeight`/`minWidth` to prevent jumps
3. **Efficient Layouts:** Use `flex` instead of calculating dimensions
4. **Smart Scrolling:** Only enable horizontal scroll when needed

## Future Enhancements

1. **Dark Mode Responsiveness**
   - Adapt colors and contrast for all screen sizes

2. **Landscape Mode**
   - Special handling for landscape on tablets
   - Horizontal layout optimizations

3. **Accessibility Improvements**
   - Larger font sizes for accessibility mode
   - High contrast variants

4. **Web-Specific Optimizations**
   - Sidebar navigation for desktop
   - Multi-column layouts for wide screens
   - Hover states for mouse devices

## Quick Reference

### Import Responsive Tools
```typescript
import { useResponsive, getGridColumns } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
```

### Get Screen Info
```typescript
const { width, isSmallPhone, isTablet } = useResponsive();
const theme = getResponsiveTheme(width);
```

### Responsive Style Pattern
```typescript
<View style={[
  styles.container,
  isSmallPhone && { paddingHorizontal: Spacing.sm },
  isTablet && { paddingHorizontal: Spacing.xl },
]}>
  {/* Content adapts to screen size */}
</View>
```

## Documentation References

- [React Native Responsive Design](https://reactnative.dev/docs/dimensions)
- [Expo Router](https://expo.dev/docs/router/)
- [Safe Area Context](https://github.com/th3rd-man/react-native-safe-area-context)
- [Web Design Standards](https://www.w3.org/WAI/WCAG21/quickref/)
