import * as SecureStore from 'expo-secure-store';

// The sign-in token is the only secret on the phone, so it lives in the OS keychain/keystore.
const TOKEN_KEY = 'careloop.token';

export async function loadToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing stored, or the keychain is unavailable; either way the phone is signed out.
  }
}
