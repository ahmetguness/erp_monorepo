export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryMuted: string;
  
  background: string;
  surface: string;
  surfaceCard: string;
  surfaceElevated: string;
  
  border: string;
  borderSubtle: string;
  borderFocus: string;
  
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  
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
  
  // Navigation / Tabs
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  
  // Status Bar style
  statusBar: 'dark' | 'light';
}

export const lightColors: ThemeColors = {
  primary: '#2563EB',        // blue-600
  primaryHover: '#3B82F6',   // blue-500
  primaryActive: '#1D4ED8',  // blue-700
  primaryMuted: '#EFF6FF',   // blue-50
  
  background: '#F8FAFC',     // slate-50
  surface: '#FFFFFF',        // white
  surfaceCard: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  
  border: '#E2E8F0',         // slate-200
  borderSubtle: '#F1F5F9',   // slate-100
  borderFocus: '#2563EB',    // blue-600
  
  text: '#0F172A',           // slate-900
  textSecondary: '#334155',  // slate-700
  textMuted: '#64748B',      // slate-500
  textInverse: '#FFFFFF',
  
  success: '#10B981',        // emerald-500
  successMuted: '#ECFDF5',   // emerald-50
  warning: '#F59E0B',        // amber-500
  warningMuted: '#FFFBEB',   // amber-50
  danger: '#EF4444',         // red-500
  dangerMuted: '#FEF2F2',    // red-50
  info: '#0EA5E9',           // sky-500
  infoMuted: '#F0F9FF',      // sky-50
  
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabBarActive: '#2563EB',
  tabBarInactive: '#94A3B8',
  
  statusBar: 'dark',
};

export const darkColors: ThemeColors = {
  primary: '#3B82F6',        // blue-500
  primaryHover: '#60A5FA',   // blue-400
  primaryActive: '#2563EB',  // blue-600
  primaryMuted: '#1E293B',   // slate-800
  
  background: '#0B0F19',     // custom deep dark slate
  surface: '#111827',        // slate-900
  surfaceCard: '#1E293B',    // slate-800
  surfaceElevated: '#334155',// slate-700
  
  border: '#1E293B',         // slate-800
  borderSubtle: '#0F172A',   // slate-900
  borderFocus: '#3B82F6',    // blue-500
  
  text: '#F8FAFC',           // slate-50
  textSecondary: '#CBD5E1',  // slate-300
  textMuted: '#94A3B8',      // slate-400
  textInverse: '#0F172A',
  
  success: '#34D399',        // emerald-400
  successMuted: '#064E3B',   // emerald-900
  warning: '#FBBF24',        // amber-400
  warningMuted: '#78350F',   // amber-900
  danger: '#F87171',         // red-400
  dangerMuted: '#7F1D1D',    // red-900
  info: '#38BDF8',           // sky-400
  infoMuted: '#0C4A6E',      // sky-900
  
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  
  tabBar: '#111827',
  tabBarBorder: '#1E293B',
  tabBarActive: '#3B82F6',
  tabBarInactive: '#64748B',
  
  statusBar: 'light',
};
