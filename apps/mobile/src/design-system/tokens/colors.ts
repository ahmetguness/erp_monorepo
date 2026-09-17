// apps/mobile/src/design-system/tokens/colors.ts

export interface DepthLayers {
  canvas: string;
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
}

export interface GlassTokens {
  glassBg: string;
  glassBorder: string;
  glassBorderActive: string;
  glassHighlight: string;
}

export interface SemanticGlows {
  primaryGlow: string;
  accentVioletGlow: string;
  emeraldGlow: string;
  amberGlow: string;
  crimsonGlow: string;
}

export interface QuantumColors extends DepthLayers, GlassTokens, SemanticGlows {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryMuted: string;

  accentViolet: string;
  emeraldNeon: string;
  amberPulse: string;
  crimsonLaser: string;
  cyanSignal: string;

  border: string;
  borderSubtle: string;
  borderFocus: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textNumerical: string;
  textInverse: string;

  // Legacy Theme Bridge properties
  background: string;
  surface: string;
  surfaceCard: string;
  surfaceElevated: string;
  text: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;
  white: string;
  black: string;
  transparent: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  statusBar: 'dark' | 'light';
}

export const quantumDarkColors: QuantumColors = {
  // Brand & High-Tech Neon Accents
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  primaryActive: '#2563EB',
  primaryMuted: '#1E293B',
  primaryGlow: 'rgba(59, 130, 246, 0.28)',

  accentViolet: '#8B5CF6',
  accentVioletGlow: 'rgba(139, 92, 246, 0.30)',

  emeraldNeon: '#10B981',
  emeraldGlow: 'rgba(16, 185, 129, 0.25)',

  amberPulse: '#F59E0B',
  amberGlow: 'rgba(245, 158, 11, 0.25)',

  crimsonLaser: '#EF4444',
  crimsonGlow: 'rgba(239, 68, 68, 0.25)',

  cyanSignal: '#06B6D4',

  // Deep Obsidian Layers
  canvas: '#07090E',
  surface0: '#0D111A',
  surface1: '#131926',
  surface2: '#1A2337',
  surface3: '#24304B',

  // Hairline Frosted Glass
  glassBg: 'rgba(19, 25, 38, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBorderActive: 'rgba(59, 130, 246, 0.50)',
  glassHighlight: 'rgba(255, 255, 255, 0.04)',

  // Borders
  border: '#1E293B',
  borderSubtle: '#0F172A',
  borderFocus: '#3B82F6',

  // Typography
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textNumerical: '#FFFFFF',
  textInverse: '#07090E',

  // Legacy Theme Bridge mappings
  background: '#07090E',
  surface: '#0D111A',
  surfaceCard: '#131926',
  surfaceElevated: '#1A2337',
  text: '#F8FAFC',
  success: '#10B981',
  successMuted: '#064E3B',
  warning: '#F59E0B',
  warningMuted: '#78350F',
  danger: '#EF4444',
  dangerMuted: '#7F1D1D',
  info: '#38BDF8',
  infoMuted: '#0C4A6E',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  tabBar: 'rgba(13, 17, 26, 0.95)',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  tabBarActive: '#3B82F6',
  tabBarInactive: '#64748B',
  statusBar: 'light',
};

export const quantumLightColors: QuantumColors = {
  // Brand
  primary: '#1D4ED8',
  primaryHover: '#2563EB',
  primaryActive: '#1E40AF',
  primaryMuted: '#EFF6FF',
  primaryGlow: 'rgba(29, 78, 216, 0.16)',

  accentViolet: '#7C3AED',
  accentVioletGlow: 'rgba(124, 58, 237, 0.18)',

  emeraldNeon: '#059669',
  emeraldGlow: 'rgba(5, 150, 105, 0.20)',

  amberPulse: '#D97706',
  amberGlow: 'rgba(217, 119, 6, 0.20)',

  crimsonLaser: '#DC2626',
  crimsonGlow: 'rgba(220, 38, 38, 0.20)',

  cyanSignal: '#0891B2',

  // Silky Executive Canvas
  canvas: '#F4F6F9',
  surface0: '#FFFFFF',
  surface1: '#FFFFFF',
  surface2: '#F1F4F9',
  surface3: '#E2E8F0',

  // Frosted Glass Light
  glassBg: 'rgba(255, 255, 255, 0.92)',
  glassBorder: 'rgba(226, 232, 240, 0.85)',
  glassBorderActive: 'rgba(29, 78, 216, 0.45)',
  glassHighlight: 'rgba(255, 255, 255, 0.65)',

  // Borders
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderFocus: '#1D4ED8',

  // Typography
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textNumerical: '#090D16',
  textInverse: '#FFFFFF',

  // Legacy Theme Bridge mappings
  background: '#F4F6F9',
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  text: '#0F172A',
  success: '#059669',
  successMuted: '#ECFDF5',
  warning: '#D97706',
  warningMuted: '#FFFBEB',
  danger: '#DC2626',
  dangerMuted: '#FEF2F2',
  info: '#0284C7',
  infoMuted: '#F0F9FF',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  tabBar: 'rgba(255, 255, 255, 0.95)',
  tabBarBorder: 'rgba(226, 232, 240, 0.85)',
  tabBarActive: '#1D4ED8',
  tabBarInactive: '#94A3B8',
  statusBar: 'dark',
};

export const highContrastColors: QuantumColors = {
  ...quantumDarkColors,
  canvas: '#000000',
  surface0: '#000000',
  surface1: '#0A0A0A',
  surface2: '#141414',
  surface3: '#222222',
  border: '#FFFFFF',
  borderSubtle: '#888888',
  borderFocus: '#00FF66',
  textPrimary: '#FFFFFF',
  textSecondary: '#E0E0E0',
  textMuted: '#CCCCCC',
  textNumerical: '#00FF66',
  emeraldNeon: '#00FF66',
  primary: '#38BDF8',
  primaryGlow: 'rgba(56, 189, 248, 0.5)',
};
