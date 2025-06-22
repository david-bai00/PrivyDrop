import { useCallback } from 'react';
import { SelectionInfo } from '../types';

export const useSelection = () => {
  // Get selection
  return useCallback((): SelectionInfo | null => {
    if (typeof window === 'undefined') return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return { selection, range };
  }, []);
};