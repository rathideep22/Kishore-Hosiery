import { StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from './theme';

/**
 * Common style definitions used across the app
 * Reduces duplication and centralizes style management
 */

export const CommonStyles = StyleSheet.create({
  // Page container
  safeContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // Headers
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  pageTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },

  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },

  // Forms
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },

  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    height: 48,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.bg,
    marginBottom: Spacing.md,
  },

  // Buttons
  primaryButton: {
    backgroundColor: Colors.brand,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  secondaryButton: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  primaryButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  secondaryButtonText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // Cards
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },

  // Status pill
  statusPill: {
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },

  statusPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // Empty states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },

  emptyStateText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },

  // Center container
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  modalContent: {
    flex: 1,
    backgroundColor: Colors.bg,
    marginTop: 'auto',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },

  // Row containers
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
