import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';

interface IssuedNoteSuccessProps {
  issuedNote: any;
  error: string;
  onError: (err: string) => void;
}

export const IssuedNoteSuccess: React.FC<IssuedNoteSuccessProps> = ({ issuedNote, error, onError }) => {
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  const handleSave = async () => {
    setSaving(true);
    onError('');
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');

      const filename = `note-${issuedNote.face_value}-sats-${issuedNote.serial}.pdf`;
      const savePath = await save({
        title: 'Save Note PDF',
        defaultPath: filename,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
      });

      if (savePath) {
        const pdfBytes = await invoke<number[]>('get_pdf_from_bin', { binB64: issuedNote.bin_b64 });
        await writeFile(savePath, new Uint8Array(pdfBytes));
        setSaveSuccess(`Successfully saved note!`);

        try {
          const { openPath } = await import('@tauri-apps/plugin-opener');
          await openPath(savePath);
        } catch (e) {
          console.log("Could not open file natively", e);
        }
      } else {
        setSaving(false);
        return;
      }
    } catch (e: any) {
      onError(`Failed to save PDF: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-container-padding py-6 flex flex-col items-center">
      <div className="w-full max-w-2xl mb-4">
        <PageHeader title="Note Created" />
      </div>
      <div className="w-full max-w-2xl text-center mb-8 mt-4 flex flex-col items-center">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
          <CheckCircle className="w-12 h-12 text-emerald-400" />
        </div>
        <h3 className="text-headline-md font-headline-md text-on-surface">Note Issued!</h3>
        <p className="text-on-surface-variant text-lg">Face value: <span className="text-emerald-400 font-bold">₿{issuedNote.face_value}</span></p>
      </div>

      <div className="w-full max-w-2xl bg-surface-container-high rounded-xl p-8 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-outline-variant/30 flex flex-col space-y-6">
        <div className="noise-overlay"></div>
        <div className="relative z-10 flex flex-col space-y-8 w-full items-center h-full">
          <div className="text-center font-label-caps text-label-caps text-on-surface-variant tracking-widest">YOUR PHYSICAL NOTE</div>

          <div className="bg-white p-3 rounded-xl inline-block shadow-[0_10px_40px_rgba(0,0,0,0.5)] w-full flex justify-center max-w-[500px]">
            <img src={`data:image/svg+xml;base64,${issuedNote.svg_b64}`} alt="Physical Note" className="w-full h-auto" />
          </div>

          <div className="w-full mt-4 flex-grow flex flex-col justify-end">
            {saveSuccess ? (
              <div className="w-full bg-emerald-500/10 text-emerald-400 font-bold py-4 rounded-full text-lg text-center border border-emerald-500/20 shadow-inner">
                {saveSuccess}
              </div>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full btn-gradient text-on-primary font-bold py-4 rounded-full text-lg flex items-center justify-center disabled:opacity-50 shadow-lg hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {saving ? <Loader2 className="animate-spin w-6 h-6" /> : 'Save Note as PDF'}
              </button>
            )}
            {error && <div className="text-error text-sm mt-4 text-center bg-error/10 p-3 rounded-lg border border-error/20">{error}</div>}
          </div>
        </div>
      </div>
    </main>
  );
};
