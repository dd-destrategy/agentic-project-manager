/**
 * Toast notification hook and standalone function.
 *
 * Provides `useToast()` for React components and a standalone `toast()`
 * function that can be called from anywhere (including outside React trees,
 * e.g. TanStack Query global error handlers).
 *
 * Follows the shadcn/ui toast pattern with added convenience methods.
 */

import * as React from 'react';

import type { ToastActionElement } from '@/components/ui/toast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 1_000; // ms to keep in state after dismiss (for exit animation)

const DEFAULT_DURATION = 5_000;
const ERROR_DURATION = 8_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

export type ToasterToast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  variant?: ToastVariant;
  duration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ToastInput = Omit<ToasterToast, 'id' | 'open' | 'onOpenChange'>;

// ---------------------------------------------------------------------------
// Internal action types
// ---------------------------------------------------------------------------

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const;

type ActionType = typeof actionTypes;

type Action =
  | { type: ActionType['ADD_TOAST']; toast: ToasterToast }
  | { type: ActionType['UPDATE_TOAST']; toast: Partial<ToasterToast> }
  | { type: ActionType['DISMISS_TOAST']; toastId?: string }
  | { type: ActionType['REMOVE_TOAST']; toastId?: string };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State {
  toasts: ToasterToast[];
}

// Map of toast IDs to their removal timeouts
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) return;

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: 'REMOVE_TOAST', toastId });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((t) => addToRemoveQueue(t.id));
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      };
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Global listener pattern (allows standalone `toast()` outside React)
// ---------------------------------------------------------------------------

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let count = 0;

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

// ---------------------------------------------------------------------------
// Standalone `toast()` function
// ---------------------------------------------------------------------------

function toast(props: ToastInput) {
  const id = genId();

  const update = (updateProps: Partial<ToasterToast>) =>
    dispatch({ type: 'UPDATE_TOAST', toast: { ...updateProps, id } });

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return { id, dismiss, update };
}

// Convenience methods
toast.success = (props: Omit<ToastInput, 'variant'>) =>
  toast({ ...props, variant: 'success' });

toast.error = (props: Omit<ToastInput, 'variant'>) =>
  toast({
    ...props,
    variant: 'destructive',
    duration: props.duration ?? ERROR_DURATION,
  });

toast.warning = (props: Omit<ToastInput, 'variant'>) =>
  toast({ ...props, variant: 'warning' });

toast.info = (props: Omit<ToastInput, 'variant'>) =>
  toast({ ...props, variant: 'info' });

toast.dismiss = (toastId?: string) =>
  dispatch({ type: 'DISMISS_TOAST', toastId });

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

export { useToast, toast, DEFAULT_DURATION, ERROR_DURATION };
