import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { UpdateInfo, checkAppUpdate } from '../../services/updateService';
import { UpdateAppModal } from './UpdateAppModal';

export const AppUpdatePrompt: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Automatic check on app launch / opening
  useEffect(() => {
    let isMounted = true;

    const timer = setTimeout(async () => {
      try {
        const info = await checkAppUpdate(false);
        if (isMounted && info && info.hasUpdate) {
          setUpdateInfo(info);
        }
      } catch (e) {
        console.warn('Update check failed on launch', e);
      }
    }, 1800); // Wait 1.8s for initial app hydration & unlocking

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Event listener for manual update checks (e.g. from Settings or debug)
  useEffect(() => {
    const handleManualCheck = async (e?: Event) => {
      const isManual = (e as CustomEvent)?.detail?.isManual ?? true;
      try {
        const info = await checkAppUpdate(true);
        if (info && info.hasUpdate) {
          setUpdateInfo(info);
        } else if (isManual) {
          toast.success(`You are on the latest version! (${info?.currentVersion || 'v0.1.14'})`, {
            icon: '✨',
          });
        }
      } catch {
        if (isManual) {
          toast.error('Unable to check for updates right now.');
        }
      }
    };

    window.addEventListener('check_app_update', handleManualCheck);

    // Provide a convenient developer helper on window for fast testing
    (window as any).__checkBitnotesUpdate = (simulateUpdate = false) => {
      if (simulateUpdate) {
        setUpdateInfo({
          hasUpdate: true,
          currentVersion: '0.1.14',
          latestVersion: '0.2.0',
          releaseName: 'v0.2.0 - Major New Release',
          releaseNotes: 'New MoMo top up & cash out features, enhanced speed.',
          websiteUrl: 'https://bit-notes.com',
        });
      } else {
        handleManualCheck();
      }
    };

    return () => {
      window.removeEventListener('check_app_update', handleManualCheck);
      delete (window as any).__checkBitnotesUpdate;
    };
  }, []);

  if (!updateInfo) return null;

  return (
    <UpdateAppModal
      updateInfo={updateInfo}
      onClose={() => setUpdateInfo(null)}
    />
  );
};
