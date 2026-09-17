// apps/mobile/src/__tests__/design-system/responsive-and-tokens.test.ts

import { describe, it, expect } from 'vitest';
import {
  quantumDarkColors,
  quantumLightColors,
  highContrastColors,
  typography,
  tabularNumericStyle,
  microLabelStyle,
  ambientGlows,
  responsiveGutters,
  spacing,
  borderRadius,
} from '../../design-system/tokens';

describe('Design System Tokens & High-Precision System', () => {
  it('should define all 4 depth layers and glassmorphic tokens in dark mode', () => {
    expect(quantumDarkColors.canvas).toBe('#07090E');
    expect(quantumDarkColors.surface0).toBe('#0D111A');
    expect(quantumDarkColors.surface1).toBe('#131926');
    expect(quantumDarkColors.surface2).toBe('#1A2337');
    expect(quantumDarkColors.surface3).toBe('#24304B');
    expect(quantumDarkColors.glassBg).toContain('rgba');
    expect(quantumDarkColors.glassBorder).toBeDefined();
    expect(quantumDarkColors.emeraldNeon).toBe('#10B981');
    expect(quantumDarkColors.amberPulse).toBe('#F59E0B');
    expect(quantumDarkColors.crimsonLaser).toBe('#EF4444');
  });

  it('should define clean executive tokens in light mode', () => {
    expect(quantumLightColors.canvas).toBe('#F4F6F9');
    expect(quantumLightColors.surface0).toBe('#FFFFFF');
    expect(quantumLightColors.primary).toBe('#1D4ED8');
    expect(quantumLightColors.textPrimary).toBe('#0F172A');
  });

  it('should support high-contrast industrial mode for warehouse and harsh sunlight', () => {
    expect(highContrastColors.canvas).toBe('#000000');
    expect(highContrastColors.border).toBe('#FFFFFF');
    expect(highContrastColors.emeraldNeon).toBe('#00FF66');
  });

  it('should configure tabular numbers correctly to prevent layout shifts', () => {
    expect(tabularNumericStyle.fontVariant).toContain('tabular-nums');
  });

  it('should configure micro-label industrial uppercase presets', () => {
    expect(microLabelStyle.textTransform).toBe('uppercase');
    expect(microLabelStyle.fontSize).toBe(typography.sizes['2xs']);
  });

  it('should provide colored ambient glows for critical statuses', () => {
    expect(ambientGlows.primary.shadowColor).toBe('#3B82F6');
    expect(ambientGlows.emerald.shadowColor).toBe('#10B981');
    expect(ambientGlows.amber.shadowColor).toBe('#F59E0B');
    expect(ambientGlows.crimson.shadowColor).toBe('#EF4444');
  });

  it('should define responsive gutters for compact phone, phone, and tablet', () => {
    expect(responsiveGutters.compactPhone.screenHorizontal).toBe(12);
    expect(responsiveGutters.phone.screenHorizontal).toBe(16);
    expect(responsiveGutters.tabletPortrait.screenHorizontal).toBe(24);
    expect(responsiveGutters.tabletLandscape.screenHorizontal).toBe(32);
  });
});
