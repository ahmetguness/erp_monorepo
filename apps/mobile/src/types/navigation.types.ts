import { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AvailableTenant } from '../services/auth.service';

export type AuthStackParamList = {
  Intro: undefined;
  Login: undefined;
  TenantSelect: {
    availableTenants?: AvailableTenant[];
    canGoBack?: boolean;
  } | undefined;
};

export type MainTabParamList = {
  DashboardTab: undefined;
  ApprovalsTab: undefined;
  InventoryTab: undefined;
  SalesTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  TenantSelect: {
    availableTenants?: AvailableTenant[];
    canGoBack?: boolean;
  } | undefined;
  Notifications: undefined;
  FieldService: undefined;
  ProductionShopFloor: undefined;
  Finance: {
    initialTab?: 'overdue' | 'payments' | 'edocuments';
    contactId?: string;
  } | undefined;
  EmployeePortal: {
    initialTab?: 'leaves' | 'shifts' | 'payrolls';
  } | undefined;
  Copilot: {
    initialPrompt?: string;
  } | undefined;
};

export type DashboardScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'DashboardTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;
