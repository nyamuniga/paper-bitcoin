// Web Audio API Synthesizer for Sovereign Stamp FX
// Zero external files, zero latency, offline-ready, iOS & Android compatible

class SoundFX {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Heavy mechanical stamp impact + crisp golden coin chime
   */
  playSuccessStamp() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 1. Heavy bass impact ("THUD")
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(140, now);
      thudOsc.frequency.exponentialRampToValueAtTime(32, now + 0.18);

      thudGain.gain.setValueAtTime(0.7, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.22);

      // 2. High-mass mechanical click / latch
      const clickBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const data = clickBuffer.getChannelData(0);
      for (let i = 0; i < clickBuffer.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
      }
      const clickSource = ctx.createBufferSource();
      const clickFilter = ctx.createBiquadFilter();
      const clickGain = ctx.createGain();

      clickSource.buffer = clickBuffer;
      clickFilter.type = 'bandpass';
      clickFilter.frequency.setValueAtTime(2200, now);
      clickFilter.Q.setValueAtTime(2.5, now);

      clickGain.gain.setValueAtTime(0.35, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      clickSource.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickSource.start(now + 0.01);

      // 3. Golden coin harmonic shimmer (dual ringing overtones)
      const chimeFreqs = [1568, 2349, 3136]; // G6, D7, G7 sovereign chords
      chimeFreqs.forEach((freq, idx) => {
        const chimeOsc = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chimeOsc.type = 'sine';
        chimeOsc.frequency.setValueAtTime(freq, now + 0.02);

        const startTime = now + 0.02 + idx * 0.015;
        const duration = 0.55 + idx * 0.12;

        chimeGain.gain.setValueAtTime(0.12 / (idx + 1), startTime);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        chimeOsc.connect(chimeGain);
        chimeGain.connect(ctx.destination);
        chimeOsc.start(startTime);
        chimeOsc.stop(startTime + duration);
      });
    } catch (e) {
      // Audio playback fails gracefully if policy restricts
    }
  }

  /**
   * Damped crack fracture + low buzz
   */
  playFailureFracture() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 1. Snapping crack sound (filtered noise snap)
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
      }
      const noiseSource = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      noiseSource.buffer = noiseBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noiseSource.start(now);

      // 2. Damped low dissonance tone
      const lowOsc = ctx.createOscillator();
      const lowGain = ctx.createGain();
      lowOsc.type = 'triangle';
      lowOsc.frequency.setValueAtTime(95, now + 0.02);
      lowOsc.frequency.exponentialRampToValueAtTime(50, now + 0.28);

      lowGain.gain.setValueAtTime(0.25, now + 0.02);
      lowGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      lowOsc.connect(lowGain);
      lowGain.connect(ctx.destination);
      lowOsc.start(now + 0.02);
      lowOsc.stop(now + 0.3);
    } catch (e) {
      // Ignore audio policy issues
    }
  }

  /**
   * Native device haptic feedback trigger
   */
  triggerHaptic(type: 'success' | 'failure' | 'impact') {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (type === 'success') {
          navigator.vibrate([25, 60, 30]);
        } else if (type === 'failure') {
          navigator.vibrate([40, 70, 40]);
        } else if (type === 'impact') {
          navigator.vibrate(30);
        }
      } catch {
        // Ignore haptics failure if unsupported
      }
    }
  }
}

export const soundFX = new SoundFX();
