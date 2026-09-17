import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation.types';
import { SpotlightSearchModal } from '../components/search/SpotlightSearchModal';
import { GlobalSearchResult } from '../services/search.service';
import { useTheme } from '../theme';

export default function GlobalSearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme } = useTheme();

  const handleClose = () => {
    navigation.goBack();
  };

  const handleNavigateToEntity = (type: string, id: string, extra?: GlobalSearchResult) => {
    navigation.goBack();

    // Map search entity types to proper screens in the app
    switch (type) {
      case 'contact':
        navigation.navigate('Main', { screen: 'SalesTab' });
        break;
      case 'employee':
        navigation.navigate('EmployeePortal', { initialTab: 'leaves' });
        break;
      case 'product':
      case 'stock_movement':
        navigation.navigate('Main', { screen: 'InventoryTab' });
        break;
      case 'sales_order':
      case 'sales_quote':
        navigation.navigate('Main', { screen: 'SalesTab' });
        break;
      case 'purchase_order':
        navigation.navigate('Procurement', { initialTab: 'ORDERS' });
        break;
      case 'invoice':
      case 'payment':
        navigation.navigate('Finance', { initialTab: 'payments' });
        break;
      case 'service_request':
        navigation.navigate('FieldService');
        break;
      case 'work_order':
        navigation.navigate('ProductionShopFloor');
        break;
      default:
        // Default to sales tab or inventory
        if (extra?.module === 'inventory') {
          navigation.navigate('Main', { screen: 'InventoryTab' });
        } else {
          navigation.navigate('Main', { screen: 'SalesTab' });
        }
        break;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SpotlightSearchModal
        visible={true}
        onClose={handleClose}
        onNavigateToEntity={handleNavigateToEntity}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
