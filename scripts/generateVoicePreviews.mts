import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../app/languages";
import { KOKORO_VOICES, isSupertonicVoice, supertonicVoices } from "../app/reader/voices";

// Short native-language samples make every voice comparable without generating a project passage.
const samples: Record<SpeechLanguage, string> = {
  en: "This is how my voice sounds when I narrate your video.",
  ko: "안녕하세요. 제 목소리로 이야기를 들려드리겠습니다.",
  ja: "こんにちは。私の声であなたに物語をお届けします。",
  ar: "مرحباً. سأروي لكم هذه القصة بصوتي.",
  bg: "Здравейте. Нека ви разкажа тази история с моя глас.",
  cs: "Dobrý den. Takhle zní můj hlas při vyprávění příběhu.",
  da: "Hej. Sådan lyder min stemme, når jeg fortæller din historie.",
  de: "Hallo. So klingt meine Stimme, wenn ich deine Geschichte erzähle.",
  el: "Γεια σας. Έτσι ακούγεται η φωνή μου όταν αφηγούμαι την ιστορία σας.",
  es: "Hola. Así suena mi voz cuando narro tu historia.",
  et: "Tere. Nii kõlab minu hääl, kui jutustan teie lugu.",
  fi: "Hei. Tältä ääneni kuulostaa, kun kerron tarinasi.",
  fr: "Bonjour. Voici ma voix pour raconter votre histoire.",
  hi: "नमस्ते। मैं अपनी आवाज़ में आपकी कहानी सुनाऊँगा।",
  hr: "Pozdrav. Ovako zvuči moj glas dok pričam vašu priču.",
  hu: "Üdvözlöm. Így hangzik a hangom, amikor elmesélem a történetét.",
  id: "Halo. Beginilah suara saya saat menceritakan kisah Anda.",
  it: "Ciao. Ecco la mia voce mentre racconto la tua storia.",
  lt: "Sveiki. Taip skamba mano balsas, kai pasakoju jūsų istoriją.",
  lv: "Sveiki. Tā skan mana balss, kad stāstu jūsu stāstu.",
  nl: "Hallo. Zo klinkt mijn stem als ik jouw verhaal vertel.",
  pl: "Cześć. Tak brzmi mój głos, kiedy opowiadam twoją historię.",
  pt: "Olá. É assim que soa a minha voz ao contar sua história.",
  ro: "Bună. Așa sună vocea mea când vă spun povestea.",
  ru: "Здравствуйте. Так звучит мой голос, когда я рассказываю вашу историю.",
  sk: "Dobrý deň. Takto znie môj hlas, keď rozprávam váš príbeh.",
  sl: "Pozdravljeni. Tako zveni moj glas, ko pripovedujem vašo zgodbo.",
  sv: "Hej. Så här låter min röst när jag berättar din historia.",
  tr: "Merhaba. Hikâyenizi anlatırken sesim böyle duyulur.",
  uk: "Вітаю. Так звучить мій голос, коли я розповідаю вашу історію.",
  vi: "Xin chào. Đây là giọng của tôi khi kể câu chuyện của bạn.",
};

const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
if (!token) throw new Error("Set FREEREADER_TTS_API_TOKEN to generate voice previews.");

const directory = new URL("../public/voice-previews/", import.meta.url);
const requestedLanguages = process.argv.slice(2);
for (const language of requestedLanguages) {
  if (!SPEECH_LANGUAGES.some(([code]) => code === language)) throw new Error(`Unsupported language: ${language}`);
}

for (const [language] of SPEECH_LANGUAGES) {
  if (requestedLanguages.length && !requestedLanguages.includes(language)) continue;
  const languageDirectory = language === "en" ? directory : new URL(`${language}/`, directory);
  await mkdir(languageDirectory, { recursive: true });
  const voices = language === "en"
    ? [...KOKORO_VOICES.map(([voice]) => voice), ...supertonicVoices().map(([voice]) => voice)]
    : supertonicVoices().map(([voice]) => voice);
  for (const voice of voices) {
    const file = new URL(`${voice}.m4a`, languageDirectory);
    try {
      const existing = await readFile(file);
      if (existing.length > 512 && existing.toString("ascii", 4, 8) === "ftyp") continue;
    } catch { /* Missing preview: generate it below. */ }

    const response = await fetch(`${backend}/api/v1/freereader/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: samples[language],
        language,
        voice,
        speed: 1,
        ...(isSupertonicVoice(voice) ? { engine: "supertonic", steps: 12 } : {}),
      }),
    });
    if (!response.ok) throw new Error(`${language}/${voice}: speech service returned ${response.status} ${await response.text()}`);
    if (!(response.headers.get("Content-Type") ?? "").startsWith("audio/")) {
      throw new Error(`${language}/${voice}: speech service returned non-audio content.`);
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length <= 512 || new TextDecoder().decode(audio.slice(4, 8)) !== "ftyp") {
      throw new Error(`${language}/${voice}: speech service returned invalid audio.`);
    }
    await writeFile(file, audio);
    console.log(`Generated ${language}/${voice}.m4a (${audio.length} bytes)`);
  }
}
