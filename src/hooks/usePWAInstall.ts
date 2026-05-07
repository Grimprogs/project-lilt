import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallState = 'installable' | 'installed' | 'unsupported';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<InstallState>(() => {
    // Already running as standalone (installed)?
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      return 'installed';
    }
    return 'unsupported'; // start as unsupported until browser fires the event
  });

  useEffect(() => {
    // Already installed as standalone app
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstallState('installed');
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallState('installable');
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful installation
    const installedHandler = () => setInstallState('installed');
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) {
      // Already installed or can't prompt — just inform user
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallState('installed');
    }
    setDeferredPrompt(null);
  };

  // Always show button: true if installable or already installed
  const showInstallButton = installState === 'installable' || installState === 'installed';
  const isInstalled = installState === 'installed';

  return { showInstallButton, isInstalled, installState, installPWA };
}
