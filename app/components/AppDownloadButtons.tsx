import qrcode from "qrcode-generator";

const stores = [
  {
    name: "App Store",
    url: "https://apps.apple.com/app/voicereader-text-to-speech/id6808351587",
    label: "Download VoiceReader on the App Store",
    icon: <path d="M16.36 12.73c-.02-2.07 1.69-3.08 1.77-3.13-.97-1.4-2.46-1.6-2.98-1.61-1.27-.14-2.5.75-3.15.75-.64 0-1.64-.73-2.7-.71-1.38.02-2.66.81-3.37 2.03-1.44 2.49-.37 6.18 1.03 8.2.7.99 1.52 2.09 2.61 2.05 1.04-.04 1.44-.67 2.7-.67s1.62.67 2.72.65c1.13-.02 1.84-1.02 2.54-2.01.8-1.14 1.12-2.25 1.14-2.3-.02-.01-2.19-.84-2.21-3.35ZM14.32 6.43c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.88 2.57.93.07 1.88-.48 2.46-1.17Z" />,
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
            <span><small>Download on the</small><strong>{store.name}</strong></span>
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
