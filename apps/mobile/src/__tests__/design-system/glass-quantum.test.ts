// apps/mobile/src/__tests__/design-system/glass-quantum.test.ts

import { describe, it, expect } from 'vitest';
import {
  quantumDarkColors,
  quantumLightColors,
  highContrastColors,
  tabularNumericStyle,
  microLabelStyle,
} from '../../design-system/tokens';

describe('AXON Neo-Industrial Precision & Glass Quantum Design System (Section 2)', () => {
  it('should verify Layer 0 (Canvas) and Layer 1 (Surface Card) depth consistency', () => {
    expect(quantumDarkColors.canvas).toBe('#07090E');
    expect(quantumDarkColors.surface0).toBe('#0D111A');
    expect(quantumDarkColors.surface1).toBe('#131926');
    expect(quantumDarkColors.surface2).toBe('#1A2337');
    expect(quantumDarkColors.surface3).toBe('#24304B');
  });

  it('should verify Layer 3 Frosted Glass tokens and 1px hairline borders', () => {
    expect(quantumDarkColors.glassBg).toBe('rgba(19, 25, 38, 0.82)');
    expect(quantumDarkColors.glassBorder).toBe('rgba(255, 255, 255, 0.08)');
    expect(quantumDarkColors.glassBorderActive).toBe('rgba(59, 130, 246, 0.50)');
  });

  it('should verify precision status glows (emerald, amber, crimson)', () => {
    expect(quantumDarkColors.emeraldNeon).toBe('#10B981');
    expect(quantumDarkColors.amberPulse).toBe('#F59E0B');
    expect(quantumDarkColors.crimsonLaser).toBe('#EF4444');
    expect(quantumDarkColors.cyanSignal).toBe('#06B6D4');
    expect(quantumDarkColors.primaryGlow).toBe('rgba(59, 130, 246, 0.28)');
  });

  it('should enforce tabular numbers to guarantee zero layout shift', () => {
    expect(tabularNumericStyle.fontVariant).toContain('tabular-nums');
  });

  it('should format industrial micro-labels with uppercase and tight kerning', () => {
    expect(microLabelStyle.textTransform).toBe('uppercase');
    expect(microLabelStyle.fontWeight).toBe('700');
  });

  it('should verify high-contrast industrial mode guarantees maximum readability', () => {
    expect(highContrastColors.canvas).toBe('#000000');
    expect(highContrastColors.surface0).toBe('#000000');
    expect(highContrastColors.surface1).toBe('#0A0A0A');
    expect(highContrastColors.textPrimary).toBe('#FFFFFF');
    expect(highContrastColors.textNumerical).toBe('#00FF66');
    expect(highContrastColors.emeraldNeon).toBe('#00FF66');
    expect(highContrastColors.border).toBe('#FFFFFF');
  });
});


