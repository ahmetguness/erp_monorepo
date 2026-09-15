import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import IntroScreen from '../screens/IntroScreen';
import LoginScreen from '../screens/LoginScreen';
import TenantSelectScreen from '../screens/TenantSelectScreen';
import { AuthStackParamList } from '../types/navigation.types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="Intro"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Intro">
        {(props) => (
          <IntroScreen
            {...props}
            onNext={() => props.navigation.navigate('Login')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Login">
        {(props) => (
          <LoginScreen
            {...props}
            onBack={() => props.navigation.navigate('Intro')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="TenantSelect" component={TenantSelectScreen} />
    </Stack.Navigator>
  );
};
