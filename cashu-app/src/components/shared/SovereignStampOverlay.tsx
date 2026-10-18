import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { soundFX } from '../../utils/soundEffects';

/**
 * Sovereign Stamp — full-screen payment state overlay.
 *
 * The BitNotes emblem is the stamp:
 *  - pending: the emblem coin floats inside an ochre orbit
 *  - success: the coin lifts, flips on its gold edge and lands with a thud,
 *             revealing a reverse face built from the emblem's own geometric
 *             star band with an embossed check
 *  - failed:  the coin turns over to a muted terracotta "void" face and settles
 *             with a short, calm shake
 *
 * Pass `status={null}` (rather than unmounting) so the exit fade can play.
 */

export type StampPaymentStatus = 'pending' | 'success' | 'failed';
type ResultFace = 'success' | 'failed';

export interface SovereignStampOverlayProps {
  /** `null` hides the overlay with an exit animation. */
  status: StampPaymentStatus | null;
  amountSats?: number;
  /** Explicit amount number (when not showing sats, e.g. RWF) */
  amountValue?: number;
  /** Custom formatted amount text */
  amountDisplay?: string;
  /** Currency symbol or unit (defaults to '₿') */
  currency?: string;
  /** Placement of the currency symbol (defaults to 'prefix' for ₿, 'suffix' for other currencies) */
  currencyPosition?: 'prefix' | 'suffix';
  recipient?: string;
  sender?: string;
  memo?: string;
  /** Overrides the default headline for the current state. */
  title?: string;
  /** Overrides the status badge label. */
  badgeLabel?: string;
  /** Overrides the primary action button label on success (defaults to 'Done'). */
  actionLabel?: string;
  /** Static pending caption. When omitted, generic progress steps cycle. */
  subtitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  /** If provided, pending state offers "Continue in background". */
  onBackground?: () => void;
  soundEnabled?: boolean;
  hapticEnabled?: boolean;
}

// ── Brand palette (DESIGN.md + emblem) ─────────────────────────────────────
const C = {
  ochre: '#E5A83B',
  ochreLight: '#EBB755',
  forest: '#0E2E20',
  emblemGreen: '#1F5E3A',
  leaf: '#3C7D52',
  clay: '#CF7A2E',
  coinCream: '#F3E9D6',
  terracotta: '#D65D4E',
};

const FACE_PALETTE: Record<ResultFace, { ring: string; glyph: string; out: [string, string]; in: [string, string] }> = {
  success: { ring: C.emblemGreen, glyph: C.emblemGreen, out: [C.ochre, C.leaf], in: [C.emblemGreen, C.clay] },
  failed: { ring: '#A9483C', glyph: C.terracotta, out: ['#C8705F', '#BDAB8E'], in: ['#8E4B3E', '#D9C7A7'] },
};

const PARTICLE_COLORS = [C.ochre, C.leaf, C.clay, C.coinCream];

// ── Choreography (seconds) ─────────────────────────────────────────────────
const T = {
  successTotal: 1.0,
  successImpact: 0.75, // coin lands at 75% of successTotal
  failFlip: 0.6,
};
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

const DEFAULT_PENDING_STEPS = ['Contacting your mint', 'Routing over Lightning', 'Waiting for settlement'];

// ── Geometry helpers ───────────────────────────────────────────────────────
const polar = (c: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/** Emblem star band: alternating outward/inward triangles that tile an annulus. */
const BAND = (() => {
  const n = 12;
  const step = 360 / n;
  const rIn = 57;
  const rOut = 81;
  const tris: { kind: 'out' | 'in'; i: number; points: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    tris.push({ kind: 'out', i, points: pts([polar(100, rIn, a - step / 2), polar(100, rIn, a + step / 2), polar(100, rOut, a)]) });
    tris.push({ kind: 'in', i, points: pts([polar(100, rOut, a), polar(100, rOut, a + step), polar(100, rIn, a + step / 2)]) });
  }
  return tris;
})();

/** Orbit tick marks — small inward triangles echoing the band. */
const TICKS = Array.from({ length: 36 }, (_, i) => ({
  i,
  points: pts([polar(124, 119, i * 10 - 2.2), polar(124, 119, i * 10 + 2.2), polar(124, 112, i * 10)]),
}));

// ── Reverse face of the coin ───────────────────────────────────────────────
const ResultEmblem: React.FC<{ variant: ResultFace; glyphKey: string; animateGlyph: boolean }> = ({
  variant,
  glyphKey,
  animateGlyph,
}) => {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `coin-${raw}`;
  const embossId = `emboss-${raw}`;
  const pal = FACE_PALETTE[variant];
  const start = animateGlyph ? 0 : 1;

  return (
    <svg viewBox="0 0 200 200" className="block w-full h-full" aria-hidden>
      <defs>
        <radialGradient id={gradId} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FCF8EF" />
          <stop offset="100%" stopColor="#E7D9BE" />
        </radialGradient>
        <filter id={embossId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="0.35" floodColor="#ffffff" floodOpacity="0.85" />
          <feDropShadow dx="0" dy="-1" stdDeviation="0.5" floodColor="#000000" floodOpacity="0.28" />
        </filter>
      </defs>

      <circle cx="100" cy="100" r="100" fill={`url(#${gradId})`} />
      <circle cx="100" cy="100" r="86" fill="none" stroke={pal.ring} strokeWidth="5" />

      <g stroke={C.coinCream} strokeWidth="1.5" strokeLinejoin="round">
        {BAND.map((t) => (
          <polygon
            key={`${t.kind}-${t.i}`}
            points={t.points}
            fill={t.kind === 'out' ? pal.out[t.i % 2] : pal.in[t.i % 2]}
          />
        ))}
      </g>

      <circle cx="100" cy="100" r="55" fill={`url(#${gradId})`} stroke={C.ochre} strokeWidth="3" />

      <g
        key={glyphKey}
        filter={`url(#${embossId})`}
        fill="none"
        stroke={pal.glyph}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {variant === 'success' ? (
          <motion.path
            d="M74 101 L93 120 L128 83"
            initial={{ pathLength: start }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.52, duration: 0.42, ease: EASE_IN_OUT }}
          />
        ) : (
          <>
            <motion.path
              d="M80 80 L120 120"
              initial={{ pathLength: start }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.36, duration: 0.22, ease: EASE_IN_OUT }}
            />
            <motion.path
              d="M120 80 L80 120"
              initial={{ pathLength: start }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.52, duration: 0.22, ease: EASE_IN_OUT }}
            />
          </>
        )}
      </g>
    </svg>
  );
};

// ── Public component ───────────────────────────────────────────────────────
export const SovereignStampOverlay: React.FC<SovereignStampOverlayProps> = ({ status, ...rest }) => (
  <AnimatePresence>{status && <OverlayBody key="sovereign-stamp" status={status} {...rest} />}</AnimatePresence>
);

type BodyProps = Omit<SovereignStampOverlayProps, 'status'> & { status: StampPaymentStatus };

const OverlayBody: React.FC<BodyProps> = ({
  status,
  amountSats,
  amountValue,
  amountDisplay,
  currency = '₿',
  currencyPosition,
  recipient,
  sender,
  memo,
  title,
  badgeLabel,
  actionLabel = 'Done',
  subtitle,
  errorMessage,
  onRetry,
  onDismiss,
  onBackground,
  soundEnabled = true,
  hapticEnabled = true,
}) => {
  const reduce = useReducedMotion() ?? false;
  const titleId = useId();
  const d = (s: number) => (reduce ? 0 : s);

  // Keep showing the last result on the back face while flipping back to pending.
  const lastFace = useRef<ResultFace>('success');
  const face: ResultFace = status === 'pending' || !status ? lastFace.current : status;
  useEffect(() => {
    if (status && status !== 'pending') lastFace.current = status;
  }, [status]);

  // Sound + haptics land exactly on the visual impact.
  useEffect(() => {
    if (!status || status === 'pending') return;
    const delay = reduce ? 0 : (status === 'success' ? T.successImpact : T.failFlip) * 1000;
    const id = window.setTimeout(() => {
      if (status === 'success') {
        if (soundEnabled) soundFX.playSuccessStamp();
        if (hapticEnabled) soundFX.triggerHaptic('success');
      } else if (status === 'failed') {
        if (soundEnabled) soundFX.playFailureFracture();
        if (hapticEnabled) soundFX.triggerHaptic('failure');
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [status, reduce, soundEnabled, hapticEnabled]);

  // Escape closes result states.
  useEffect(() => {
    if (!status || status === 'pending' || !onDismiss) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, onDismiss]);

  // Cycle generic pending steps when no explicit caption is provided.
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (status !== 'pending' || subtitle) return;
    setStepIdx(0);
    const id = window.setInterval(() => setStepIdx((i) => (i + 1) % DEFAULT_PENDING_STEPS.length), 2600);
    return () => window.clearInterval(id);
  }, [status, subtitle]);

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const r0 = 76;
        const r1 = 130 + Math.random() * 56;
        return {
          i,
          x0: Math.cos(angle) * r0,
          y0: Math.sin(angle) * r0,
          x1: Math.cos(angle) * r1,
          y1: Math.sin(angle) * r1 + 12,
          size: 7 + Math.random() * 6,
          baseRot: (angle * 180) / Math.PI + 90,
          spin: (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 120),
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          delay: Math.random() * 0.06,
        };
      }),
    []
  );

  // ── Coin motion ──
  const flipAnimate = reduce
    ? { rotateY: 0, y: 0, scale: 1 }
    : status === 'pending'
      ? { rotateY: 0, y: 0, scale: 1 }
      : status === 'success'
        ? { rotateY: [0, 0, 180, 180], y: [0, -24, 0, 0], scale: [1, 1.08, 1, 0.94, 1] }
        : { rotateY: [0, 180], y: [0, -8, 0], scale: [1, 1.03, 1] };

  const flipTransition = reduce
    ? { duration: 0 }
    : status === 'pending'
      ? { duration: 0.6, ease: EASE_IN_OUT }
      : status === 'success'
        ? {
            rotateY: { duration: T.successTotal, times: [0, 0.22, 0.75, 1], ease: ['linear', [0.45, 0, 0.2, 1], 'linear'] },
            y: { duration: T.successTotal, times: [0, 0.22, 0.75, 1], ease: [[0.2, 0.8, 0.3, 1], [0.6, 0, 0.9, 0.5], 'linear'] },
            scale: { duration: T.successTotal, times: [0, 0.22, 0.75, 0.84, 1], ease: 'easeInOut' },
          }
        : { duration: T.failFlip, ease: EASE_IN_OUT };

  const shadowAnimate = reduce
    ? { y: 12, scale: 1, opacity: 0.5 }
    : status === 'pending'
      ? { y: [12, 18, 12], scale: [1, 0.94, 1], opacity: [0.5, 0.38, 0.5] }
      : status === 'success'
        ? { y: [12, 30, 10, 12], scale: [1, 0.86, 1.06, 1], opacity: [0.5, 0.25, 0.7, 0.5] }
        : { y: 12, scale: 1, opacity: 0.5 };

  const shadowTransition =
    status === 'pending'
      ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const }
      : status === 'success'
        ? { duration: T.successTotal, times: [0, 0.22, 0.8, 1] }
        : { duration: 0.4 };

  const faceBase: React.CSSProperties = {
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    WebkitMaskImage: '-webkit-radial-gradient(white, black)',
  };

  const headline =
    title ?? (status === 'success' ? 'Payment sent' : status === 'failed' ? 'Payment failed' : 'Sending payment');
  const isReceiveLike =
    Boolean(sender) ||
    Boolean(title?.toLowerCase().includes('received')) ||
    Boolean(title?.toLowerCase().includes('claim'));
  const pillLabel =
    badgeLabel ??
    (status === 'success'
      ? (isReceiveLike ? 'Received' : 'Settled')
      : status === 'failed'
      ? (isReceiveLike ? 'Failed' : 'Not sent')
      : 'Processing');
  const failedPill: React.CSSProperties | undefined =
    status === 'failed'
      ? { color: C.terracotta, borderColor: 'rgba(214, 93, 78, 0.45)', backgroundColor: 'rgba(214, 93, 78, 0.08)' }
      : undefined;

  const rawNum = typeof amountValue === 'number' ? amountValue : amountSats;
  const resolvedPosition = currencyPosition ?? (currency === '₿' ? 'prefix' : 'suffix');
  const showAmount = Boolean(amountDisplay || (typeof rawNum === 'number' && rawNum > 0));
  const resultDelay = status === 'success' ? T.successImpact : status === 'failed' ? T.failFlip : 0;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {status && (
        <motion.div
          key="sovereign-stamp-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-xl select-none overflow-hidden"
        >
      {/* Forest canopy light + paper grain */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(120% 70% at 50% 0%, rgba(14, 46, 32, 0.6) 0%, transparent 62%)' }}
      />
      <div aria-hidden className="absolute inset-0 texture-overlay opacity-70" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
        className="relative z-10 mx-auto flex h-full w-full max-w-sm flex-col px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]"
      >
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {/* ═══ Stage ═══ */}
          <motion.div layout="position" transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}>
            <motion.div
              animate={status === 'success' && !reduce ? { y: [0, 0, 5, -2, 0] } : { y: 0 }}
              transition={
                status === 'success' ? { duration: 1.15, times: [0, 0.65, 0.72, 0.84, 1] } : { duration: 0.2 }
              }
              className="relative flex h-[248px] w-[248px] items-center justify-center"
            >
              {/* Glow layers (cross-faded, since gradients can't interpolate) */}
              {(['pending', 'success', 'failed'] as const).map((k) => (
                <motion.div
                  key={k}
                  aria-hidden
                  className="absolute -inset-12 rounded-full pointer-events-none"
                  style={{
                    background:
                      k === 'pending'
                        ? 'radial-gradient(circle, rgba(229,168,59,0.20) 0%, rgba(229,168,59,0.05) 42%, transparent 68%)'
                        : k === 'success'
                          ? 'radial-gradient(circle, rgba(235,183,85,0.34) 0%, rgba(14,46,32,0.45) 46%, transparent 70%)'
                          : 'radial-gradient(circle, rgba(214,93,78,0.20) 0%, rgba(214,93,78,0.05) 42%, transparent 68%)',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: status === k ? 1 : 0,
                    scale: status === k && k === 'success' && !reduce ? [0.9, 0.9, 1.12, 1.04] : 1,
                  }}
                  transition={{
                    opacity: { duration: 0.5, delay: k === 'success' && status === 'success' ? d(T.successImpact - 0.1) : 0 },
                    scale: { duration: 1.3, times: [0, 0.55, 0.65, 1] },
                  }}
                />
              ))}

              {/* Tick ring — drifts while pending, freezes in place on result */}
              <div
                aria-hidden
                className="absolute inset-0 animate-[spin_48s_linear_infinite] transition-opacity duration-500"
                style={{
                  animationPlayState: status === 'pending' && !reduce ? 'running' : 'paused',
                  opacity: status === 'failed' ? 0.25 : status === 'success' ? 0.85 : 0.5,
                }}
              >
                <svg viewBox="0 0 248 248" className="h-full w-full">
                  {TICKS.map((t) => (
                    <polygon
                      key={t.i}
                      points={t.points}
                      fill={status === 'failed' ? C.terracotta : t.i % 2 ? C.leaf : C.ochre}
                      style={{ transition: 'fill 0.5s' }}
                    />
                  ))}
                </svg>
              </div>

              {/* Orbit track */}
              <svg aria-hidden viewBox="0 0 248 248" className="absolute inset-0 h-full w-full">
                <circle
                  cx="124"
                  cy="124"
                  r="104"
                  fill="none"
                  strokeWidth="1.5"
                  stroke={status === 'failed' ? 'rgba(214,93,78,0.28)' : 'rgba(229,168,59,0.16)'}
                  style={{ transition: 'stroke 0.5s' }}
                />
              </svg>

              {/* Pending orbit arc */}
              <AnimatePresence>
                {status === 'pending' && (
                  <motion.div
                    key="arc"
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.25 } }}
                    className="absolute inset-0"
                  >
                    <div className={`h-full w-full ${reduce ? '' : 'animate-[spin_1.6s_linear_infinite]'}`}>
                      <svg viewBox="0 0 248 248" className="h-full w-full">
                        <circle
                          cx="124"
                          cy="124"
                          r="104"
                          fill="none"
                          stroke={C.ochre}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeDasharray="78 576"
                          style={{ filter: 'drop-shadow(0 0 6px rgba(229,168,59,0.6))' }}
                        />
                      </svg>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success: the orbit closes into a full ring just before impact */}
              {status === 'success' && (
                <svg aria-hidden viewBox="0 0 248 248" className="absolute inset-0 h-full w-full">
                  <motion.circle
                    cx="124"
                    cy="124"
                    r="104"
                    fill="none"
                    stroke={C.ochre}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    transform="rotate(-90 124 124)"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: d(0.3), duration: 0.45, ease: EASE_IN_OUT }}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(229,168,59,0.5))' }}
                  />
                </svg>
              )}

              {/* Success: impact ripples */}
              {status === 'success' &&
                !reduce &&
                [0, 1].map((i) => (
                  <motion.div
                    key={`wave-${i}`}
                    aria-hidden
                    className="absolute h-40 w-40 rounded-full pointer-events-none"
                    style={{ border: `${i ? 1 : 1.5}px solid ${C.ochre}` }}
                    initial={{ scale: 1, opacity: 0 }}
                    animate={{ scale: [1, 2.1], opacity: [0.75, 0] }}
                    transition={{ delay: T.successImpact + i * 0.1, duration: 0.95, ease: EASE_OUT_EXPO }}
                  />
                ))}

              {/* Contact shadow — shrinks as the coin lifts, spreads on landing */}
              <motion.div
                aria-hidden
                className="absolute h-40 w-40 rounded-full bg-black pointer-events-none"
                style={{ filter: 'blur(14px)' }}
                initial={false}
                animate={shadowAnimate}
                transition={shadowTransition}
              />

              {/* ═══ The coin ═══ */}
              <motion.div
                animate={status === 'failed' && !reduce ? { x: [0, -9, 8, -5, 3, -1, 0] } : { x: 0 }}
                transition={status === 'failed' ? { delay: T.failFlip, duration: 0.5, ease: 'easeOut' } : { duration: 0.2 }}
              >
                <motion.div
                  animate={status === 'pending' && !reduce ? { y: [0, -6, 0] } : { y: 0 }}
                  transition={
                    status === 'pending' ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }
                  }
                >
                  <div className="relative h-40 w-40" style={{ perspective: 900 }}>
                    <motion.div
                      className="relative h-full w-full"
                      style={{ transformStyle: 'preserve-3d' }}
                      initial={false}
                      animate={flipAnimate}
                      transition={flipTransition}
                    >
                      {/* Obverse: brand emblem */}
                      <div
                        className="absolute inset-0 overflow-hidden rounded-full"
                        style={{
                          ...faceBase,
                          ...(reduce ? { opacity: status === 'pending' ? 1 : 0, transition: 'opacity 0.3s' } : null),
                        }}
                      >
                        <img
                          src="/logo.png"
                          alt=""
                          draggable={false}
                          className="pointer-events-none h-full w-full scale-[1.19] select-none object-cover"
                        />
                        {status === 'pending' && !reduce && (
                          <div
                            className="absolute top-0 bottom-0 w-[60%] animate-logo-shine pointer-events-none"
                            style={{
                              background:
                                'linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.12) 70%, rgba(255,255,255,0) 100%)',
                            }}
                          />
                        )}
                        <div
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{ boxShadow: `inset 0 0 0 3px ${C.ochre}, inset 0 0 0 4.5px rgba(0,0,0,0.35)` }}
                        />
                      </div>

                      {/* Gold edge — only visible mid-flip */}
                      {!reduce && (
                        <div
                          aria-hidden
                          className="absolute left-1/2 top-[3%] h-[94%] w-[10px] -ml-[5px] rounded-[5px]"
                          style={{
                            transform: 'rotateY(90deg)',
                            background: 'linear-gradient(180deg, #F6D08A 0%, #C88A26 50%, #F6D08A 100%)',
                          }}
                        />
                      )}

                      {/* Reverse: result stamp */}
                      <div
                        className="absolute inset-0 overflow-hidden rounded-full"
                        style={{
                          ...faceBase,
                          transform: reduce ? undefined : 'rotateY(180deg)',
                          ...(reduce ? { opacity: status === 'pending' ? 0 : 1, transition: 'opacity 0.3s' } : null),
                        }}
                      >
                        <ResultEmblem variant={face} glyphKey={status} animateGlyph={status !== 'pending' && !reduce} />
                        <div
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{ boxShadow: `inset 0 0 0 3px ${C.ochre}, inset 0 0 0 4.5px rgba(0,0,0,0.35)` }}
                        />
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              </motion.div>

              {/* Success: emblem shards burst outward like rays */}
              {status === 'success' &&
                !reduce &&
                particles.map((p) => (
                  <motion.div
                    key={`p-${p.i}`}
                    aria-hidden
                    className="absolute left-1/2 top-1/2 pointer-events-none"
                    style={{
                      width: p.size,
                      height: p.size,
                      marginLeft: -p.size / 2,
                      marginTop: -p.size / 2,
                      backgroundColor: p.color,
                      clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                    }}
                    initial={{ x: p.x0, y: p.y0, opacity: 0, scale: 0.4, rotate: p.baseRot }}
                    animate={{
                      x: [p.x0, p.x1],
                      y: [p.y0, p.y1],
                      opacity: [0, 1, 1, 0],
                      scale: [0.4, 1, 0.7],
                      rotate: [p.baseRot, p.baseRot + p.spin],
                    }}
                    transition={{
                      delay: T.successImpact + p.delay,
                      duration: 1,
                      ease: EASE_OUT_EXPO,
                      opacity: { delay: T.successImpact + p.delay, duration: 1, times: [0, 0.1, 0.6, 1] },
                    }}
                  />
                ))}
            </motion.div>
          </motion.div>

          {/* ═══ Copy ═══ */}
          <motion.div
            layout="position"
            transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
            className="mt-6 flex w-full flex-col items-center"
            aria-live="polite"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`pill-${status}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, delay: status === 'pending' ? 0 : d(resultDelay - 0.15) }}
                className="status-pill inline-flex items-center gap-2 rounded-full px-3 py-1"
                style={failedPill}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {status === 'pending' && !reduce && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                  )}
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                {pillLabel}
              </motion.span>
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                id={titleId}
                key={`title-${status}-${headline}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, delay: status === 'pending' ? 0 : d(resultDelay - 0.1), ease: EASE_OUT_EXPO }}
                className="mt-3 text-headline-md font-headline-md text-on-surface"
              >
                {headline}
              </motion.h2>
            </AnimatePresence>

            {showAmount && (
              <motion.div
                className="mt-2 flex items-baseline justify-center gap-1.5 font-mono tabular-nums"
                animate={status === 'success' && !reduce ? { scale: [1, 1, 1.06, 1] } : { scale: 1 }}
                transition={status === 'success' ? { duration: 1.2, times: [0, 0.62, 0.74, 1] } : { duration: 0.2 }}
              >
                {resolvedPosition === 'prefix' && (
                  <motion.span
                    className="text-[22px] font-medium"
                    initial={false}
                    animate={{ color: status === 'failed' ? 'var(--color-on-surface-variant)' : C.ochre, opacity: status === 'failed' ? 0.7 : 0.9 }}
                    transition={{ duration: 0.4 }}
                  >
                    {currency}
                  </motion.span>
                )}
                <motion.span
                  className="text-[40px] font-semibold leading-none tracking-tight"
                  initial={false}
                  animate={{
                    color:
                      status === 'success'
                        ? C.ochre
                        : status === 'failed'
                          ? 'var(--color-on-surface-variant)'
                          : 'var(--color-on-surface)',
                  }}
                  transition={{ duration: 0.4, delay: d(resultDelay) }}
                >
                  {amountDisplay ? amountDisplay : rawNum!.toLocaleString()}
                </motion.span>
                {resolvedPosition === 'suffix' && (
                  <motion.span
                    className="text-[18px] font-medium tracking-wide uppercase"
                    initial={false}
                    animate={{ color: status === 'failed' ? 'var(--color-on-surface-variant)' : C.ochre, opacity: status === 'failed' ? 0.7 : 0.9 }}
                    transition={{ duration: 0.4 }}
                  >
                    {currency}
                  </motion.span>
                )}
              </motion.div>
            )}

            {/* Pending caption */}
            {status === 'pending' && (
              <div className="mt-3 h-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={subtitle ?? stepIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="text-body-sm font-body-sm text-on-surface-variant"
                  >
                    {subtitle ?? `${DEFAULT_PENDING_STEPS[stepIdx]}…`}
                  </motion.p>
                </AnimatePresence>
              </div>
            )}

            {/* Success receipt */}
            {status === 'success' && (recipient || sender || memo) && (
              <motion.dl
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: d(T.successImpact + 0.25), duration: 0.45, ease: EASE_OUT_EXPO }}
                className="mt-6 w-full overflow-hidden rounded-2xl border border-outline-variant bg-surface-container/70 text-left amber-rim"
              >
                {sender && (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-label-caps font-label-caps uppercase text-on-surface-variant">From</dt>
                    <dd className="min-w-0 truncate font-mono text-body-sm text-on-surface">{sender}</dd>
                  </div>
                )}
                {sender && (recipient || memo) && <div className="divider-dashed mx-4" />}
                {recipient && (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-label-caps font-label-caps uppercase text-on-surface-variant">To</dt>
                    <dd className="min-w-0 truncate font-mono text-body-sm text-on-surface">{recipient}</dd>
                  </div>
                )}
                {recipient && memo && <div className="divider-dashed mx-4" />}
                {memo && (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-label-caps font-label-caps uppercase text-on-surface-variant">Memo</dt>
                    <dd className="min-w-0 truncate text-body-sm text-on-surface">{memo}</dd>
                  </div>
                )}
              </motion.dl>
            )}

            {/* Failure reason */}
            {status === 'failed' && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: d(T.failFlip + 0.1), duration: 0.4, ease: EASE_OUT_EXPO }}
                className="mt-5 w-full rounded-2xl px-4 py-3 text-body-sm font-body-sm text-on-surface select-text"
                style={{ backgroundColor: 'rgba(214, 93, 78, 0.08)', border: '1px solid rgba(214, 93, 78, 0.28)' }}
              >
                {errorMessage || 'The payment could not be completed. No route was found or the mint is unavailable.'}
              </motion.p>
            )}
          </motion.div>
        </div>

        {/* ═══ Actions (pinned to the bottom) ═══ */}
        <div className="flex min-h-[120px] w-full flex-col justify-end gap-3">
          <AnimatePresence mode="wait" initial={false}>
            {status === 'success' && (
              <motion.div
                key="actions-success"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: d(T.successImpact + 0.35), duration: 0.4, ease: EASE_OUT_EXPO }}
              >
                <button
                  type="button"
                  autoFocus
                  onClick={onDismiss}
                  className="btn-primary w-full rounded-2xl py-4 text-[16px] active:scale-[0.98] cursor-pointer"
                >
                  {actionLabel}
                </button>
              </motion.div>
            )}

            {status === 'failed' && (
              <motion.div
                key="actions-failed"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: d(T.failFlip + 0.2), duration: 0.4, ease: EASE_OUT_EXPO }}
                className="flex flex-col gap-3"
              >
                {onRetry && (
                  <button
                    type="button"
                    autoFocus
                    onClick={onRetry}
                    className="btn-primary w-full rounded-2xl py-4 text-[16px] active:scale-[0.98] cursor-pointer"
                  >
                    Try again
                  </button>
                )}
                {onDismiss && (
                  <button
                    type="button"
                    autoFocus={!onRetry}
                    onClick={onDismiss}
                    className="btn-secondary w-full rounded-2xl py-3.5 text-[15px] active:scale-[0.98] cursor-pointer"
                  >
                    Go back
                  </button>
                )}
              </motion.div>
            )}

            {status === 'pending' && onBackground && (
              <motion.div
                key="actions-pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: d(4), duration: 0.5 }}
                className="flex justify-center"
              >
                <button
                  type="button"
                  onClick={onBackground}
                  className="rounded-2xl px-4 py-2 text-body-sm text-on-surface-variant transition-colors hover:text-primary cursor-pointer"
                >
                  Continue in background
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
