import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation.types';
import { CopilotModal } from '../components/copilot/CopilotModal';

type CopilotScreenRouteProp = RouteProp<RootStackParamList, 'Copilot'>;
type CopilotScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Copilot'>;

export default function CopilotScreen() {
  const navigation = useNavigation<CopilotScreenNavigationProp>();
  const route = useRoute<CopilotScreenRouteProp>();

  const initialPrompt = route.params?.initialPrompt;

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <CopilotModal
        initialPrompt={initialPrompt}
        showFloatingButton={false}
        isOpenControlled={true}
        onCloseControlled={handleClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
