export * from './api.types';
export * from './navigation.types';

export interface ScreenProps {
  onNext?: () => void;
  onBack?: () => void;
}
