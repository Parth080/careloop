import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular';
import { AtkinsonHyperlegibleNext_600SemiBold } from '@expo-google-fonts/atkinson-hyperlegible-next/600SemiBold';
import { AtkinsonHyperlegibleNext_700Bold } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { clearSnapshot } from './src/cache';
import type { Session } from './src/model';
import Home from './src/screens/Home';
import { startReminders, stopReminders } from './src/reminders';
import Onboarding from './src/screens/Onboarding';
import { clearToken, loadToken, saveToken } from './src/session';
import { ThemeProvider, useTheme } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <CareLoop />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function CareLoop() {
  const { c, dark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ AtkinsonHyperlegibleNext_400Regular, AtkinsonHyperlegibleNext_600SemiBold, AtkinsonHyperlegibleNext_700Bold });
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined while the keychain is read
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    void loadToken().then(setToken);
  }, []);

  const signIn = useCallback(async (session: Session) => {
    // The invite code is already used up, so stay signed in for now even if the keychain write fails.
    await saveToken(session.token).catch(() => undefined);
    startReminders();
    setNotice(undefined);
    setToken(session.token);
  }, []);

  const signOut = useCallback(async (message?: string) => {
    await Promise.all([clearToken(), clearSnapshot(), stopReminders()]); // stop reminders for someone else's medicines
    setNotice(message);
    setToken(null);
  }, []);

  // If the font can't load, the phone's own font is still readable, so carry on without it.
  const ready = (fontsLoaded || !!fontError) && token !== undefined;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {!ready ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : token ? (
        <Home token={token} onSignedOut={signOut} />
      ) : (
        <Onboarding notice={notice} onSignedIn={signIn} />
      )}
    </View>
  );
}
