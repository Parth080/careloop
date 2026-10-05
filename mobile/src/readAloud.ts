import * as Speech from 'expo-speech';

import { speechLanguage } from './model';

export function readAloud(text: string): void {
  void Speech.stop();
  Speech.speak(text, { language: speechLanguage(text), rate: 0.9 });
}
