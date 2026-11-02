import qrcode from "qrcode-generator";

const stores = [
  {
    name: "App Store",
    prefix: "Download on the",
    url: "https://apps.apple.com/app/voicereader-text-to-speech/id6808351587",
    label: "Download VoiceReader on the App Store",
    icon: <path d="M16.36 12.73c-.02-2.07 1.69-3.08 1.77-3.13-.97-1.4-2.46-1.6-2.98-1.61-1.27-.14-2.5.75-3.15.75-.64 0-1.64-.73-2.7-.71-1.38.02-2.66.81-3.37 2.03-1.44 2.49-.37 6.18 1.03 8.2.7.99 1.52 2.09 2.61 2.05 1.04-.04 1.44-.67 2.7-.67s1.62.67 2.72.65c1.13-.02 1.84-1.02 2.54-2.01.8-1.14 1.12-2.25 1.14-2.3-.02-.01-2.19-.84-2.21-3.35ZM14.32 6.43c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.88 2.57.93.07 1.88-.48 2.46-1.17Z" />,
  },
  {
    name: "Chrome Web Store",
    prefix: "Available in the",
    url: "https://chromewebstore.google.com/detail/freereader-text-to-speech/nkndgadokffoldebphmdphjepcedcakc",
    label: "Get VoiceReader for Chrome",
    icon: <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />,
  },
].map((store) => {
  const qr = qrcode(0, "M");
  qr.addData(store.url);
  qr.make();
  return { ...store, qrSvg: qr.createSvgTag(4, 0) };
});

export default function AppDownloadButtons() {
  return (
    <div className="app-downloads">
      {stores.map((store) => (
        <div className="app-download" key={store.name}>
          <a className="app-store-button" href={store.url} target="_blank" rel="noopener noreferrer" aria-label={store.label}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{store.icon}</svg>
            <span><small>{store.prefix}</small><strong>{store.name}</strong></span>
          </a>
          <div className="app-download-qr" aria-hidden="true">
            <div className="app-download-qr-image" dangerouslySetInnerHTML={{ __html: store.qrSvg }} />
            <span>Scan for {store.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
