import { Colors } from './theme';

export const StatusColors = {
  READY: Colors.success,
  PARTIAL_READY: Colors.warning,
  PENDING: Colors.danger,
  DISPATCHED: Colors.textSecondary,
  CANCELLED: Colors.textSecondary,
};

export const StatusLabel = {
  READY: 'Ready',
  PARTIAL_READY: 'Partial Ready',
  PENDING: 'Pending',
  DISPATCHED: 'Dispatched',
  CANCELLED: 'Cancelled',
};

export const GOWDOWNS = {
  SUNDHA: 'Sundha',
  LAL_SHIVNAGAR: 'Lal-Shivnagar',
} as const;

export const ORDER_STATUS = {
  PENDING: 'Pending',
  READY: 'Ready',
  PARTIAL_READY: 'Partial Ready',
  DISPATCHED: 'Dispatched',
} as const;
