import { useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';

// In-app speech recognition exists only in CareLoop's own build. Expo Go doesn't include it, and
// importing the package there would crash, so look the native module up and treat it as optional.
const recognizer = requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition');

export const inAppVoiceAvailable = recognizer !== null;

// Several boxes can take speech, but the phone has one recognizer: only the box that started it gets the words.
let listeningOwner: object | null = null;

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
  const me = useRef({});
  const mine = () => listeningOwner === me.current;

  useEffect(() => {
    handlers.current = { onHeard, onProblem };
  });

  useEffect(() => {
    if (!recognizer) return;
    const subscriptions = [
      recognizer.addListener('result', (event) => {
        const text = event.results[0]?.transcript;
        if (text && mine()) handlers.current.onHeard(text);
      }),
      recognizer.addListener('end', () => {
        if (!mine()) return;
        listeningOwner = null;
        setListening(false);
      }),
      recognizer.addListener('error', (event) => {
        if (!mine()) return;
        listeningOwner = null;
        setListening(false);
        if (event.error !== 'aborted') {
          handlers.current.onProblem(errorMessages[event.error] ?? 'Voice input stopped. You can try again or type instead.');
        }
      }),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      if (mine()) {
        listeningOwner = null;
        recognizer.abort();
      }
    };
  }, []);

  async function start() {
    if (!recognizer) return;
    if (listeningOwner) {
      // Already starting here (a second tap while the permission prompt is up), or listening for another box.
      if (!mine()) handlers.current.onProblem('The microphone is already listening for another box. Tap Stop there first.');
      return;
    }
    listeningOwner = me.current; // claimed before waiting for permission, so two taps can't both start it
    try {
      if (!recognizer.isRecognitionAvailable()) {
        listeningOwner = null;
        handlers.current.onProblem("This phone can't turn speech into text. Use the microphone on your keyboard instead.");
        return;
      }
      const permission = await recognizer.requestPermissionsAsync();
      if (!permission.granted) {
        listeningOwner = null;
        handlers.current.onProblem(errorMessages['not-allowed']!);
        return;
      }
      setListening(true);
      recognizer.start({ lang, interimResults: true, continuous: false, addsPunctuation: true });
    } catch {
      listeningOwner = null;
      setListening(false);
      handlers.current.onProblem('Voice input did not start. You can type instead.');
    }
  }

  function stop() {
    if (mine()) recognizer?.stop();
  }

  return { available: inAppVoiceAvailable, listening, start, stop };
}
