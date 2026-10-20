import * as Speech from 'expo-speech';

import { speechLanguage } from './model';

export function readAloud(text: string): void {
  void Speech.stop();
  // Android can't speak more than maxSpeechInputLength characters at once.
  Speech.speak(text.slice(0, Speech.maxSpeechInputLength), { language: speechLanguage(text), rate: 0.9 });
}
