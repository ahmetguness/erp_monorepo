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
export const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
  addEventListener: () => ({ remove: () => {} }),
};

export const Animated = {
  Value: function (val: number) {
    return {
      setValue: () => {},
      interpolate: () => 0,
      current: val,
    };
  },
  timing: () => ({
    start: (cb?: () => void) => cb && cb(),
  }),
  spring: () => ({
    start: (cb?: () => void) => cb && cb(),
  }),
  parallel: () => ({
    start: (cb?: () => void) => cb && cb(),
  }),
  sequence: () => ({
    start: (cb?: () => void) => cb && cb(),
  }),
  View: 'Animated.View',
  Text: 'Animated.Text',
  createAnimatedComponent: (comp: any) => comp,
};

export const ScrollView = 'ScrollView';
export const Pressable = 'Pressable';
export const TextInput = 'TextInput';
export const Modal = 'Modal';
export const Share = {
  share: async () => ({ action: 'sharedAction' }),
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
  Dimensions,
  Animated,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Share,
};

