// LAB463 — tarjeta "Install app" de la home del staff (ver offline/install.ts).
// Se oculta cuando se abre desde la app ya instalada. En la computadora solo
// aparece si el navegador ofrece instalar; en el celular aparece siempre,
// porque es donde la usan los cleaners.
import { useEffect, useState } from 'react';
import { Download, Share, EllipsisVertical, X } from 'lucide-react';
import { installPlatform, promptInstall, refreshInstalledState, useInstallState } from '../../offline/install';

export default function InstallAppCard() {
  const { canPrompt, installed } = useInstallState();
  const [help, setHelp] = useState(false);
  const platform = installPlatform();

  // Android sabe contestar si ya la instalaron, aunque estemos en el navegador.
  useEffect(() => {
    void refreshInstalledState();
  }, []);

  if (installed) return null;
  if (!canPrompt && platform === 'other') return null;

  async function handleInstall() {
    const result = await promptInstall();
    // Sin diálogo nativo disponible: pasos para hacerlo a mano.
    if (result === 'unavailable') setHelp(true);
  }

  return (
    <>
      <section className="bg-[#031634] text-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install the app</p>
          <p className="text-xs text-white/70 mt-0.5">
            Add the staff app to your home screen. It opens faster and keeps working without internet.
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="flex-shrink-0 flex items-center gap-1.5 bg-white text-[#031634] text-sm font-semibold rounded-xl px-3 py-2 hover:bg-gray-100"
        >
          <Download size={15} /> Install app
        </button>
      </section>

      {help && <InstallHelp platform={platform} onClose={() => setHelp(false)} />}
    </>
  );
}

function InstallHelp({ platform, onClose }: { platform: 'ios' | 'android' | 'other'; onClose: () => void }) {
  const ios = platform === 'ios';
  const steps = ios
    ? [
        <>
          Tap the <Share size={14} className="inline -mt-0.5" /> <b>Share</b> button in Safari&apos;s toolbar.
        </>,
        <>
          Scroll down and tap <b>Add to Home Screen</b>.
        </>,
        <>
          Tap <b>Add</b>, then open the staff app from your home screen.
        </>,
      ]
    : [
        <>
          Tap the <EllipsisVertical size={14} className="inline -mt-0.5" /> menu at the top right of Chrome.
        </>,
        <>
          Tap <b>Install app</b> or <b>Add to Home screen</b>.
        </>,
        <>Confirm, then open the staff app from your home screen.</>,
      ];

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="How to install the app"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-[#031634]">
            {ios ? 'Install on iPhone' : 'Install on your phone'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 -m-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-700">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#031634] text-white text-xs font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400">
          {ios
            ? "iPhone doesn't let a website install itself, so it takes these three taps."
            : 'If the menu shows "Open app" instead, it\'s already installed.'}
        </p>
        <button onClick={onClose} className="w-full bg-[#031634] text-white text-sm font-semibold rounded-xl py-2.5">
          Got it
        </button>
      </div>
    </div>
  );
}
