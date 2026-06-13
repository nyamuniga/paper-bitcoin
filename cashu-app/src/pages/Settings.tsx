import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const Settings = () => {
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleReveal = async () => {
    setLoading(true);
    try {
      const res: string[] = await invoke('get_recovery_words');
      setWords(res);
    } catch (e) {
      alert("Failed to get words: " + e);
    }
    setLoading(false);
  };

  return (
    <div className="p-4 mt-8">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      
      <div className="bg-surface rounded-2xl p-6 border border-gray-800">
        <h2 className="text-xl font-bold mb-4 text-gray-300">Recovery Phrase</h2>
        <p className="text-gray-500 mb-4 text-sm">
          These 24 words can be used to recover your wallet if you lose your device. Do not share them with anyone.
        </p>
        
        {words.length === 0 ? (
          <button 
            onClick={handleReveal} 
            disabled={loading}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Reveal Recovery Phrase
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {words.map((word, i) => (
              <div key={i} className="bg-background rounded p-2 text-sm font-mono flex">
                <span className="text-gray-500 w-6 select-none">{i + 1}.</span>
                <span className="text-primary font-bold">{word}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
