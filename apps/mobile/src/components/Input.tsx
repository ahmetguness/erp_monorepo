import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, Platform } from 'react-native';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  rightLabel?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, rightLabel, icon, style, ...rest }) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {rightLabel}
      </View>
      <View style={[
        styles.inputWrapper,
        isFocused && styles.inputFocusedWrapper,
        error && styles.inputErrorWrapper,
      ]}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            icon ? { paddingLeft: 8 } : undefined,
            style,
          ]}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholderTextColor="#94A3B8"
          {...rest}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155', // slate-700
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC', // slate-50
    borderWidth: 1.5,
    borderColor: '#E2E8F0', // slate-200
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  inputFocusedWrapper: {
    borderColor: '#2563EB', // blue-600
    backgroundColor: '#ffffff',
  },
  inputErrorWrapper: {
    borderColor: '#EF4444',
  },
  iconContainer: {
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A', // slate-900
    minHeight: 56, // Applied directly to input to increase touch target
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
});
