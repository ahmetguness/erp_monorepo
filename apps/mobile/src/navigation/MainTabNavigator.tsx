// apps/mobile/src/navigation/MainTabNavigator.tsx

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import DashboardScreen from '../screens/DashboardScreen';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import InventoryScreen from '../screens/InventoryScreen';
import SalesScreen from '../screens/SalesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { MainTabParamList, MainTabNavigationProp } from '../types/navigation.types';
import { useTheme } from '../design-system/hooks/useTheme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { TabletSideRail } from './TabletSideRail';
import { PhoneFloatingDock } from './PhoneFloatingDock';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator: React.FC = () => {
  const { theme } = useTheme();
  const { showSideRail } = useResponsive();
  const navigation = useNavigation<MainTabNavigationProp>();
  const [activeTab, setActiveTab] = useState<keyof MainTabParamList>('DashboardTab');

  const handleTabletNavigate = (routeName: keyof MainTabParamList) => {
    setActiveTab(routeName);
    navigation.navigate(routeName);
  };

  if (showSideRail) {
    return (
      <View style={[styles.tabletLayout, { backgroundColor: theme.colors.canvas }]}>
        <TabletSideRail
          activeRouteName={activeTab}
          onNavigate={handleTabletNavigate}
        />
        <View style={styles.tabletMainContent}>
          <Tab.Navigator
            initialRouteName="DashboardTab"
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
            screenListeners={{
              state: (e) => {
                const state = e.data.state;
                if (state) {
                  const currentRoute = state.routes[state.index];
                  if (currentRoute) {
                    setActiveTab(currentRoute.name as keyof MainTabParamList);
                  }
                }
              },
            }}
          >
            <Tab.Screen
              name="DashboardTab"
              component={DashboardScreen}
              options={{ tabBarLabel: 'Özet' }}
            />
            <Tab.Screen
              name="ApprovalsTab"
              component={ApprovalsScreen}
              options={{ tabBarLabel: 'Onaylar' }}
            />
            <Tab.Screen
              name="InventoryTab"
              component={InventoryScreen}
              options={{ tabBarLabel: 'Depo' }}
            />
            <Tab.Screen
              name="SalesTab"
              component={SalesScreen}
              options={{ tabBarLabel: 'Satış' }}
            />
            <Tab.Screen
              name="ProfileTab"
              component={ProfileScreen}
              options={{ tabBarLabel: 'Profil' }}
            />
          </Tab.Navigator>
        </View>
      </View>
    );
  }

  return (
    <Tab.Navigator
      initialRouteName="DashboardTab"
      tabBar={(props) => <PhoneFloatingDock {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Özet' }}
      />
      <Tab.Screen
        name="ApprovalsTab"
        component={ApprovalsScreen}
        options={{ tabBarLabel: 'Onaylar' }}
      />
      <Tab.Screen
        name="InventoryTab"
        component={InventoryScreen}
        options={{ tabBarLabel: 'Depo' }}
      />
      <Tab.Screen
        name="SalesTab"
        component={SalesScreen}
        options={{ tabBarLabel: 'Satış' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profil' }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabletLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  tabletMainContent: {
    flex: 1,
    height: '100%',
  },
});
