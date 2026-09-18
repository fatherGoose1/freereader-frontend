export const SPEECH_LANGUAGES = [
  ["en", "English"], ["ko", "Korean"], ["ja", "Japanese"], ["ar", "Arabic"],
  ["bg", "Bulgarian"], ["cs", "Czech"], ["da", "Danish"], ["de", "German"],
  ["el", "Greek"], ["es", "Spanish"], ["et", "Estonian"], ["fi", "Finnish"],
  ["fr", "French"], ["hi", "Hindi"], ["hr", "Croatian"], ["hu", "Hungarian"],
  ["id", "Indonesian"], ["it", "Italian"], ["lt", "Lithuanian"], ["lv", "Latvian"],
  ["nl", "Dutch"], ["pl", "Polish"], ["pt", "Portuguese"], ["ro", "Romanian"],
  ["ru", "Russian"], ["sk", "Slovak"], ["sl", "Slovenian"], ["sv", "Swedish"],
  ["tr", "Turkish"], ["uk", "Ukrainian"], ["vi", "Vietnamese"],
] as const;

export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number][0];
