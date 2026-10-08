import { Linking } from 'react-native';

import { dialableNumber } from './model';

/** Open the phone app to call a number. Returns a message for the person if that wasn't possible. */
export async function callNumber(phone: string): Promise<string | null> {
  const number = dialableNumber(phone);
  if (!number) return 'This number needs to be fixed before it can be called.';
  try {
    await Linking.openURL(`tel:${number}`);
    return null;
  } catch {
    return `Couldn't open the phone app. Please dial ${phone} yourself.`;
  }
}
