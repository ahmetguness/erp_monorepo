// apps/mobile/src/design-system/hooks/useResponsive.ts

import { useWindowDimensions } from 'react-native';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsiveGutters } from '../tokens/spacing';

export type DeviceCategory = 'compact-phone' | 'phone' | 'tablet-portrait' | 'tablet-landscape';

export interface ResponsiveState {
  width: number;
  height: number;
  isTablet: boolean;
  isLandscape: boolean;
  deviceCategory: DeviceCategory;
  gridColumns: number;
  gutter: number;
  cardPadding: number;
  itemGap: number;
  contentMaxWidth: number;
  showMasterDetail: boolean;
  showSideRail: boolean;
  sideRailWidth: number;
  insets: EdgeInsets;
}

export function useResponsive(): ResponsiveState {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isLandscape = width > height;
  const isTablet = width >= 768 || (isLandscape && width >= 900);

  let deviceCategory: DeviceCategory = 'phone';
  if (width < 390) {
    deviceCategory = 'compact-phone';
  } else if (!isTablet) {
    deviceCategory = 'phone';
  } else if (width >= 1024 || isLandscape) {
    deviceCategory = 'tablet-landscape';
  } else {
    deviceCategory = 'tablet-portrait';
  }

  // Calculate dynamic grid columns
  let gridColumns = 1;
  if (deviceCategory === 'tablet-landscape') {
    gridColumns = 3;
  } else if (deviceCategory === 'tablet-portrait' || width >= 540) {
    gridColumns = 2;
  }

  // Gutter parameters
  const currentGutter =
    deviceCategory === 'compact-phone'
      ? responsiveGutters.compactPhone
      : deviceCategory === 'phone'
      ? responsiveGutters.phone
      : deviceCategory === 'tablet-portrait'
      ? responsiveGutters.tabletPortrait
      : responsiveGutters.tabletLandscape;

  // Max readable container width for forms & screens
  let contentMaxWidth = width;
  if (deviceCategory === 'tablet-portrait') {
    contentMaxWidth = 720;
  } else if (deviceCategory === 'tablet-landscape') {
    contentMaxWidth = 1200;
  }

  const showMasterDetail = isTablet && (isLandscape || width >= 960);
  const showSideRail = isTablet;
  const sideRailWidth = isTablet ? (isLandscape ? 220 : 72) : 0;

  return {
    width,
    height,
    isTablet,
    isLandscape,
    deviceCategory,
    gridColumns,
    gutter: currentGutter.screenHorizontal,
    cardPadding: currentGutter.cardPadding,
    itemGap: currentGutter.itemGap,
    contentMaxWidth,
    showMasterDetail,
    showSideRail,
    sideRailWidth,
    insets,
  };
}
