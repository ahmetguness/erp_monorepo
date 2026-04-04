// ─────────────────────────────────────────────
// Generic form utility types
// ─────────────────────────────────────────────

// Select option — generic, T is the value type
export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

// Form field state
export interface FieldState {
  error?: string;
  isDirty?: boolean;
  isTouched?: boolean;
}

// Modal state
export interface ModalState<T = null> {
  isOpen: boolean;
  data: T | null;
}

export function openModal<T>(data: T): ModalState<T> {
  return { isOpen: true, data };
}

export function closeModal<T>(): ModalState<T> {
  return { isOpen: false, data: null };
}
