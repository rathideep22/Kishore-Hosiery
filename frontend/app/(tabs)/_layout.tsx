import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Colors, FontSize } from '../../src/constants/theme';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export default function TabLayout() {
  const { user, unreadCount } = useAuth();
  const { width } = useWindowDimensions();
  const isAdmin = user?.role === 'admin';
  const hideLabels = width < 390;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, hideLabels && { height: 50, paddingBottom: 0 }],
        tabBarActiveTintColor: Colors.brand,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: [styles.tabLabel, hideLabels && { display: 'none' }],
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: hideLabels ? '' : 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: hideLabels ? '' : 'Catalog',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sundha"
        options={{
          title: hideLabels ? '' : 'Sundha',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lal-shivnagar"
        options={{
          title: hideLabels ? '' : 'Lal-Shiv',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: hideLabels ? '' : 'Users',
          href: isAdmin ? '/(tabs)/users' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: hideLabels ? '' : 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="notifications-outline" size={size} color={color} />
              <Badge count={unreadCount} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 60,
    paddingBottom: 6,
  },
  tabLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
});
