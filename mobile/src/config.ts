import Constants from 'expo-constants';

import { resolveApiUrl } from './model';

export function apiBaseUrl(): string | null {
  return resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, Constants.expoConfig?.hostUri, __DEV__);
}
