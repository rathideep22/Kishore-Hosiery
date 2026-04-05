import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { api } from '../utils/api';

interface User {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'staff' | 'accountant';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  unreadCount: number;
  wsMessage: any;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wsMessage, setWsMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    loadAuth();
  }, []);

  useEffect(() => {
    if (token) {
      api.setToken(token);
      connectWebSocket(token);
      fetchUnreadCount();
    } else {
      api.setToken(null);
      wsRef.current?.close();
    }
    return () => { wsRef.current?.close(); };
  }, [token]);

  const loadAuth = async () => {
    try {
      const [savedToken, savedUser] = await Promise.all([
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('user'),
      ]);
      if (savedToken && savedUser) {
        // Validate token by calling /me endpoint
        try {
          api.setToken(savedToken);
          const user = await api.get('/auth/me');
          setToken(savedToken);
          setUser(user);
        } catch {
          // Token is invalid/expired, clear it
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
          api.setToken(null);
        }
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const login = async (newToken: string, newUser: User) => {
    await AsyncStorage.setItem('token', newToken);
    await AsyncStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setUnreadCount(0);
  };

  const fetchUnreadCount = async () => {
    try {
      const data = await api.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {}
  };

  const refreshUnreadCount = useCallback(async () => {
    await fetchUnreadCount();
  }, []);

  const playNotificationSound = async () => {
    try {
      // Enable audio session to play through speaker even in silent mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const sound = new Audio.Sound();

      // Use a default notification sound from CDN (reliable, always available)
      await sound.loadAsync({
        uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
      });

      await sound.playAsync();

      // Cleanup after sound finishes
      setTimeout(() => {
        sound.unloadAsync().catch(() => {});
      }, 2000);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  };

  const connectWebSocket = (tkn: string) => {
    const wsUrl = 'ws://13.60.90.159';
    const ws = new WebSocket(`${wsUrl}/api/ws?token=${tkn}`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setWsMessage(data);
        if (data.type === 'NOTIFICATION') {
          setUnreadCount(prev => prev + 1);
          // Play notification sound
          playNotificationSound();
        }
      } catch {}
    };
    ws.onerror = () => {
      // WebSocket connection failed - app still works with polling
    };
    ws.onclose = () => {
      // Only retry if we expect WebSocket to work
      setTimeout(() => {
        if (token) connectWebSocket(tkn);
      }, 10000); // Increased retry interval to reduce server load
    };
    wsRef.current = ws;
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, unreadCount, wsMessage, login, logout, refreshUnreadCount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
