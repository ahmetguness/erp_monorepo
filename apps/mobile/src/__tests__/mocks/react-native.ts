export const Platform = {
  OS: 'ios',
  select: <T>(obj: Record<string, T>): T => (obj.ios !== undefined ? obj.ios : obj.default),
};

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  hairlineWidth: 1,
  absoluteFillObject: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

export const View = 'View';
export const Text = 'Text';
export const TouchableOpacity = 'TouchableOpacity';
export const ActivityIndicator = 'ActivityIndicator';
export const FlatList = 'FlatList';
export const Alert = {
  alert: () => {},
};

export default {
  Platform,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
};
