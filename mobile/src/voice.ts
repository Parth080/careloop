import { useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';

// In-app speech recognition exists only in CareLoop's own build. Expo Go doesn't include it, and
// importing the package there would crash, so look the native module up and treat it as optional.
const recognizer = requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition');

export const inAppVoiceAvailable = recognizer !== null;

const errorMessages: Partial<Record<string, string>> = {
  'not-allowed': 'CareLoop needs microphone permission to listen. You can type instead.',
  'no-speech': "I didn't hear anything. Tap Speak and try again.",
  'speech-timeout': "I didn't hear anything. Tap Speak and try again.",
  network: 'Voice needs an internet connection right now. You can type instead.',
  'language-not-supported': "This phone can't listen in this language. You can type instead.",
};

/** Tap-to-talk dictation. `onHeard` receives everything heard so far in the current listening session. */
export function useVoiceInput(onHeard: (text: string) => void, onProblem: (message: string) => void, lang = 'en-IN') {
  const [listening, setListening] = useState(false);
  const handlers = useRef({ onHeard, onProblem });

  useEffect(() => {
    handlers.current = { onHeard, onProblem };
  });

  useEffect(() => {
    if (!recognizer) return;
    const subscriptions = [
      recognizer.addListener('result', (event) => {
        const text = event.results[0]?.transcript;
        if (text) handlers.current.onHeard(text);
      }),
      recognizer.addListener('end', () => setListening(false)),
      recognizer.addListener('error', (event) => {
        setListening(false);
        if (event.error !== 'aborted') {
          handlers.current.onProblem(errorMessages[event.error] ?? 'Voice input stopped. You can try again or type instead.');
        }
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  async function start() {
    if (!recognizer) return;
    try {
      if (!recognizer.isRecognitionAvailable()) {
        handlers.current.onProblem("This phone can't turn speech into text. Use the microphone on your keyboard instead.");
        return;
      }
      const permission = await recognizer.requestPermissionsAsync();
      if (!permission.granted) {
        handlers.current.onProblem(errorMessages['not-allowed']!);
        return;
      }
      setListening(true);
      recognizer.start({ lang, interimResults: true, continuous: false, addsPunctuation: true });
    } catch {
      setListening(false);
      handlers.current.onProblem('Voice input did not start. You can type instead.');
    }
  }

  function stop() {
    recognizer?.stop();
  }

  return { available: inAppVoiceAvailable, listening, start, stop };
}
