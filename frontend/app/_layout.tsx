import { useEffect } from 'react';
import { Stack, useSegments, useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inTabs = segments[0] === '(tabs)';
    if (!user && inTabs) {
      router.replace('/');
    } else if (user && !inTabs && segments[0] !== 'order' && segments[0] !== 'all-orders' && segments[0] !== 'dispatch') {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#09090B" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="all-orders" options={{ presentation: 'card' }} />
        <Stack.Screen name="dispatch" options={{ presentation: 'card' }} />
        <Stack.Screen name="order/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="order/[id]/category/[categoryId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="order/create" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
});
