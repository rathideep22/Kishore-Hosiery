/**
 * Validation utilities for form inputs
 */

export function validateQuantity(quantity: string): { valid: boolean; error?: string } {
  if (!quantity || quantity.trim() === '') {
    return { valid: false, error: 'Quantity is required' };
  }
  const num = parseFloat(quantity);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: 'Quantity must be a number greater than 0' };
  }
  return { valid: true };
}

export function validateRate(rate: string): { valid: boolean; error?: string } {
  if (!rate || rate.trim() === '') {
    return { valid: false, error: 'Rate is required' };
  }
  const num = parseFloat(rate);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: 'Rate must be a number greater than 0' };
  }
  return { valid: true };
}

export function validatePartyName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Party name is required' };
  }
  return { valid: true };
}

export function validateGowdown(gowdown: string): { valid: boolean; error?: string } {
  if (!gowdown) {
    return { valid: false, error: 'Please select a gowdown' };
  }
  return { valid: true };
}
