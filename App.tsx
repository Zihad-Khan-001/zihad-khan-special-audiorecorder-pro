import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EngineProvider, MeterProvider } from './state/EngineContext';
import StudioScreen from './screens/StudioScreen';
import DSPLabScreen from './screens/DSPLabScreen';
import { C } from './lib/theme';

const Tab = createBottomTabNavigator();

const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: C.red,
    background: C.bg,
    card: C.card,
    text: C.text,
    border: C.line,
    notification: C.red,
  },
  fonts: DefaultTheme.fonts,
};

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <EngineProvider>
        <MeterProvider>
          <View style={styles.root}>
            <NavigationContainer theme={navTheme}>
              <Tab.Navigator
                screenOptions={{
                  headerShown: false,
                  tabBarActiveTintColor: C.red,
                  tabBarInactiveTintColor: C.dimmer,
                  tabBarStyle: {
                    backgroundColor: C.card,
                    borderTopColor: C.line,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    height: 84,
                    paddingTop: 8,
                  },
                  tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 0.6,
                  },
                }}
              >
                <Tab.Screen
                  name="Studio"
                  component={StudioScreen}
                  options={{
                    tabBarLabel: 'STUDIO',
                    tabBarIcon: ({ color, focused }) => (
                      <Ionicons name={focused ? 'mic' : 'mic-outline'} size={22} color={color} />
                    ),
                  }}
                />
                <Tab.Screen
                  name="DSPLab"
                  component={DSPLabScreen}
                  options={{
                    tabBarLabel: 'DSP LAB',
                    tabBarIcon: ({ color, focused }) => (
                      <Ionicons name={focused ? 'options' : 'options-outline'} size={22} color={color} />
                    ),
                  }}
                />
              </Tab.Navigator>
            </NavigationContainer>
            <StatusBar style="light" />
          </View>
        </MeterProvider>
      </EngineProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
