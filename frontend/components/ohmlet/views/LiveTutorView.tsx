import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Focus,
  Lock,
  Mic,
  MicOff,
  MousePointer2,
  PhoneOff,
  Smartphone,
  Radio,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  SquarePlus,
  Volume2,
  Wrench,
  Zap,
} from 'lucide-react';
import { useLiveBridge } from '../../../hooks/useLiveBridge';
import { track } from '../../../services/analytics';
import { usePlan } from '../../../hooks/usePlan';
import { useIdentity } from '../../../hooks/useIdentity';
import { LIVE_MINUTES_PER_MONTH, PLAN_META } from '../entitlements';
import { getAssemblyProcedure, verifyAssemblyAction, type ProcedureStep, type VerificationResult } from '../../../services/assemblyTutor';

/**
 * LiveTutorView — the live bench session. The camera feed is the hero; voice
 * is the primary channel. The learner points a camera at their breadboard and
 * the tutor sees it, talks them through assembly/disassembly, and corrects
 * mistakes live.
 *
 * Stages mirror physical repair flow: inspect → disassemble → assemble → validate.
 */

interface LiveTutorViewProps {
  /** Optional build to anchor the session (defaults to the flagship LDR alarm). */
  buildTitle?: string;
  /** Route the learner to the upgrade path (pricing now, Stripe Checkout via #30). */
  onUpgrade?: () => void;
}

type Stage = 'inspect' | 'disassemble' | 'assemble' | 'validate';
type ProductId = 'mouse' | 'phone' | 'cpu' | 'custom';
type RepairAction = 'disassemble' | 'assemble';

const STAGES: Array<{ id: Stage; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { id: 'inspect', label: 'Inspect', icon: ScanLine, hint: 'Show every side so I can spot screws, clips, seams, and risks.' },
  { id: 'disassemble', label: 'Disassemble', icon: Wrench, hint: 'I will guide one teardown step at a time and watch your progress.' },
  { id: 'assemble', label: 'Assemble', icon: Cpu, hint: 'I will guide reassembly, cable routing, screws, and connector checks.' },
  { id: 'validate', label: 'Validate', icon: CheckCircle2, hint: 'We will check safety, fit, leftover parts, and power-on behavior.' },
];

const PRODUCT_OPTIONS: Array<{
  id: ProductId;
  title: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  cautions: string[];
}> = [
  {
    id: 'mouse',
    title: 'Computer mouse',
    label: 'Mouse',
    desc: 'Buttons, shell clips, wheel, sensor board, cable or battery bay.',
    icon: MousePointer2,
    cautions: ['Remove batteries or unplug USB first', 'Watch tiny springs and scroll-wheel parts'],
  },
  {
    id: 'phone',
    title: 'Mobile phone',
    label: 'Phone',
    desc: 'Back cover, display, battery, ribbon cables, camera modules, screws.',
    icon: Smartphone,
    cautions: ['Power off first', 'Do not puncture or bend lithium batteries'],
  },
  {
    id: 'cpu',
    title: 'CPU or desktop computer',
    label: 'CPU',
    desc: 'Cabinet panels, motherboard, RAM, storage, cooler, PSU cables.',
    icon: Cpu,
    cautions: ['Unplug mains power first', 'Do not open the power supply unit'],
  },
  {
    id: 'custom',
    title: 'Custom device',
    label: 'Add new',
    desc: 'Name any product and the tutor will adapt from what it sees.',
    icon: SquarePlus,
    cautions: ['Start with a full outside inspection', 'Stop if you see batteries, mains parts, heat, or swelling'],
  },
];

export const LiveTutorView: React.FC<LiveTutorViewProps> = ({ onUpgrade }) => {
  const wsUrl = useMemo(() => {
    const raw = import.meta.env.VITE_OHMLET_WS_URL || 'ws://localhost:8082';
    return raw.replace(/\/$/, '');
  }, []);
  const { userId } = useIdentity();
  const sessionId = useRef(`live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).current;

  const [stage, setStage] = useState<Stage>('inspect');
  const [productId, setProductId] = useState<ProductId>('mouse');
  const [customProduct, setCustomProduct] = useState('');
  const [repairAction, setRepairAction] = useState<RepairAction>('disassemble');
  const [procedure, setProcedure] = useState<ProcedureStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [procedureError, setProcedureError] = useState('');
  const [draft, setDraft] = useState('');
  const [snapped, setSnapped] = useState(false);
  const budgetImageState = useState(true); // [ok, setOk] for the 402 art fallback

  const { canGoLive, liveCapMinutes, liveMinutesRemaining, consumeLiveSeconds, plan } = usePlan(userId);

  const {
    state,
    micOn,
    camOn,
    facing,
    transcripts,
    connect,
    disconnect,
    toggleMic,
    toggleCam,
    switchCamera,
    captureSnapshot,
    grabFrame,
    sendText,
    sendStageUpdate,
    sendSessionContext,
    videoRef,
  } = useLiveBridge({ wsUrl, userId, sessionId });

  const selectedProduct = PRODUCT_OPTIONS.find((p) => p.id === productId) ?? PRODUCT_OPTIONS[0];
  const productName = productId === 'custom' && customProduct.trim() ? customProduct.trim() : selectedProduct.title;
  const liveTitle = `${productName} ${repairAction === 'assemble' ? 'assembly' : 'disassembly'}`;
  const currentStep = procedure[stepIndex];
  const quickPrompts = useMemo(
    () => [
      `Inspect this ${productName} and tell me the safest first step.`,
      `Guide me to ${repairAction} this ${productName} one step at a time.`,
      'Look closely and tell me what screws, clips, or cables you can see.',
      'Check whether it is safe before I continue.',
    ],
    [productName, repairAction],
  );

  const live = state === 'connected';
  const connecting = state === 'connecting';
  const unlimited = liveCapMinutes === Infinity;
  // Warn as the monthly budget runs low so running out is never a surprise.
  // Threshold scales with the cap: 10% of it, but at least 10 minutes.
  const lowTimeThreshold = Math.max(10, liveCapMinutes * 0.1);
  const lowTime = !unlimited && liveMinutesRemaining > 0 && liveMinutesRemaining <= lowTimeThreshold;

  // Meter live time against the plan's monthly budget while connected, and cut the
  // session off when the budget runs out (the same cap the server enforces).
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => consumeLiveSeconds(10), 10000);
    return () => clearInterval(id);
  }, [live, consumeLiveSeconds]);

  useEffect(() => {
    if (live && liveMinutesRemaining <= 0) disconnect();
  }, [live, liveMinutesRemaining, disconnect]);

  // Pair every live_session_start with an end event when the session closes
  // (user ends it, runs out of minutes, or leaves the view).
  const wasLive = useRef(false);
  useEffect(() => {
    if (live) {
      wasLive.current = true;
    } else if (wasLive.current) {
      wasLive.current = false;
      track('live_session_end');
    }
  }, [live]);

  // Start the session and request mic + camera in the same user gesture so the
  // browser shows the permission prompt right away.
  const goLive = () => {
    track('live_session_start');
    connect();
    if (!micOn) toggleMic();
    if (!camOn) toggleCam();
  };

  useEffect(() => {
    let cancelled = false;
    setStepIndex(0);
    setVerification(null);
    setProcedureError('');
    getAssemblyProcedure(productId, repairAction)
      .then((steps) => { if (!cancelled) setProcedure(steps); })
      .catch(() => { if (!cancelled) setProcedureError('No fixed procedure is available for this custom device; the tutor will use inspect-first guidance.'); });
    return () => { cancelled = true; };
  }, [productId, repairAction]);

  useEffect(() => {
    if (!live) return;
    sendSessionContext({
      product: productName,
      productId,
      action: repairAction,
      stage,
    });
    sendStageUpdate(stage);
  }, [live, productName, productId, repairAction, stage, sendSessionContext, sendStageUpdate]);

  const snapNow = () => {
    captureSnapshot();
    setSnapped(true);
    setTimeout(() => setSnapped(false), 700);
  };

  const setStageAndNotify = (s: Stage) => {
    setStage(s);
    if (live) sendStageUpdate(s);
  };

  const send = (text: string) => {
    if (!text.trim() || !live) return;
    sendText(text, stage);
    setDraft('');
  };

  const verifyCurrentStep = async () => {
    if (!currentStep || !camOn || verifying) return;
    const frame = await grabFrame(1024);
    if (!frame) {
      setVerification({ status: 'unclear', expected_step: currentStep.id, observed_action: 'No usable frame', observed_state: 'Unknown', evidence: [], missing: [], next_instruction: 'Turn the camera on and show the current step clearly.', confidence: 0 });
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyAssemblyAction({ frame, productId, product: productName, action: repairAction, stepId: currentStep.id, previousState: verification?.observed_state });
      setVerification(result);
      if (result.status === 'verified' && stepIndex < procedure.length - 1) {
        setStepIndex((index) => index + 1);
      }
    } catch (error) {
      setVerification({ status: 'unclear', expected_step: currentStep.id, observed_action: 'Verification unavailable', observed_state: 'Unknown', evidence: [], missing: [], next_instruction: error instanceof Error ? error.message : 'Try again with a clearer view.', confidence: 0 });
    } finally {
      setVerifying(false);
    }
  };

  // ── Out of live budget (the upgrade moment, a friendly 402) ──
  if (!live && !connecting && !canGoLive) {
    const upgradeTo = plan === 'free' ? PLAN_META.pro : PLAN_META.max;
    const upgradeHours = Math.round(LIVE_MINUTES_PER_MONTH[upgradeTo.id] / 60);
    const upgradeLine = `${upgradeHours} hours of live time a month`;
    const [imgOk, setImgOk] = budgetImageState;
    return (
      <div className="ohmlet-rise mx-auto max-w-xl">
        <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-ohmlet-ink-soft">Live tutor</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.02em] md:text-4xl">That is this month's bench time used.</h1>
        <div className="mt-6 overflow-hidden rounded-[1.8rem] border-[3px] border-ohmlet-ink bg-white shadow-press">
          <div className="flex flex-col items-center gap-5 bg-ohmlet-gold-soft px-7 py-8 text-center">
            <img
              src="/errors/402.png"
              alt=""
              aria-hidden
              onError={() => setImgOk(false)}
              className="h-28 w-auto"
              style={{ display: imgOk ? undefined : 'none' }}
              draggable={false}
            />
            {!imgOk && (
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-ohmlet-ink bg-white">
                <Lock className="h-7 w-7 text-ohmlet-gold-deep" />
              </span>
            )}
            <div>
              <p className="text-lg font-black text-ohmlet-ink">
                You have used all {liveCapMinutes} live minutes on the {PLAN_META[plan].label} plan this month.
              </p>
              <p className="mt-1.5 text-sm font-semibold text-ohmlet-ink-soft">
                Your lessons, sandbox, and community stay open, and live resets at the start of next month. Learners who
                upgrade go hands-on far more often, which is where it really sticks.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 px-7 py-6 sm:flex-row sm:justify-center">
            <button
              onClick={onUpgrade}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-[2.5px] border-ohmlet-ink bg-ohmlet-gold px-6 py-3.5 text-base font-black shadow-press transition-all hover:translate-y-[3px] hover:shadow-none sm:w-auto"
            >
              Upgrade to {upgradeTo.label} for {upgradeLine}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pre-flight (not connected) ──
  if (!live && !connecting) {
    return (
      <div className="ohmlet-rise mx-auto max-w-5xl">
        <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-ohmlet-ink-soft">Live tutor</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.02em] md:text-4xl">Repair with a tutor that watches your hands.</h1>

        <div className="mt-6 overflow-hidden rounded-[1.8rem] border-[3px] border-ohmlet-gold bg-ohmlet-ink text-white shadow-[0_0_40px_rgba(250,204,46,0.18)]">
          <div className="relative grid gap-6 p-8 md:grid-cols-[1.2fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ohmlet-gold/40 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-ohmlet-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-ohmlet-gold" /> Voice + camera
              </span>
              <h2 className="mt-4 text-2xl font-black">{liveTitle}</h2>
              <p className="mt-2 text-sm font-semibold text-white/65">
                Show the real object or its parts. The tutor will inspect it continuously and guide one physical step at a time.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  'Use the camera device that can clearly see your desk',
                  'Talk hands-free while the tutor watches screws, clips, cables, and parts',
                  'It asks before risky steps and slows down when the view is unclear',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm font-semibold text-white/85">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ohmlet-gold" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-ohmlet-gold/10 blur-2xl" />
              <img src="/brand/ohmlet-mascot.png" alt="" aria-hidden className="ohmlet-float relative h-44 w-auto" draggable={false} />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-white/55">
              Ohmlet asks for camera and microphone access when the session starts.
              {!unlimited && ` ${Math.floor(liveMinutesRemaining)} of ${liveCapMinutes} min left this month.`}
            </p>
            <button
              onClick={goLive}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border-[2.5px] border-ohmlet-ink bg-ohmlet-gold px-7 py-3.5 text-base font-black text-ohmlet-ink shadow-press transition-all hover:translate-y-[3px] hover:shadow-none"
            >
              <Radio className="h-5 w-5" /> Go live
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {PRODUCT_OPTIONS.map((product) => {
            const Icon = product.icon;
            const on = productId === product.id;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => setProductId(product.id)}
                className={`min-h-[150px] rounded-2xl border-2 p-4 text-left transition-all ${
                  on
                    ? 'border-ohmlet-ink bg-ohmlet-gold shadow-press-sm'
                    : 'border-ohmlet-line bg-white text-ohmlet-ink hover:border-ohmlet-ink'
                }`}
              >
                <Icon className="h-6 w-6" />
                <p className="mt-3 text-base font-black">{product.label}</p>
                <p className="mt-1 text-xs font-semibold leading-snug text-ohmlet-ink-soft">{product.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[1.4rem] border-2 border-ohmlet-line bg-white p-5 shadow-soft">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-ohmlet-ink-soft">Task</h3>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['disassemble', 'assemble'] as RepairAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    setRepairAction(action);
                    setStage(action);
                  }}
                  className={`rounded-2xl border-2 px-4 py-3 text-sm font-black capitalize transition-all ${
                    repairAction === action
                      ? 'border-ohmlet-ink bg-ohmlet-gold shadow-press-sm'
                      : 'border-ohmlet-line bg-ohmlet-cream text-ohmlet-ink-soft hover:border-ohmlet-ink hover:text-ohmlet-ink'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
            {productId === 'custom' && (
              <input
                value={customProduct}
                onChange={(e) => setCustomProduct(e.target.value)}
                placeholder="Type product name, e.g. keyboard, speaker, router"
                className="mt-4 w-full rounded-2xl border-2 border-ohmlet-line bg-ohmlet-cream px-4 py-3 text-sm font-semibold text-ohmlet-ink outline-none focus:border-ohmlet-ink"
              />
            )}
          </div>

          <div className="rounded-[1.4rem] border-2 border-ohmlet-line bg-white p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-ohmlet-red" />
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-ohmlet-ink-soft">Safety check</h3>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedProduct.cautions.map((caution) => (
                <span key={caution} className="inline-flex items-center gap-1.5 rounded-full border-2 border-ohmlet-line bg-ohmlet-cream px-3 py-1.5 text-sm font-bold text-ohmlet-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-ohmlet-red" />
                  {caution}
                </span>
              ))}
            </div>
          </div>
        </div>
        {procedure.length > 0 && (
          <div className="mt-5 rounded-[1.4rem] border-2 border-ohmlet-line bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-ohmlet-ink-soft">Structured procedure</h3>
                <p className="mt-1 text-sm font-black text-ohmlet-ink">Step 1 of {procedure.length}: {procedure[0].instruction}</p>
              </div>
              <span className="rounded-full border-2 border-ohmlet-line bg-ohmlet-cream px-3 py-1 text-xs font-black">Ground truth</span>
            </div>
          </div>
        )}
        {procedureError && <p className="mt-3 text-sm font-semibold text-ohmlet-ink-soft">{procedureError}</p>}
      </div>
    );
  }

  // ── Live session ──
  return (
    <div className="ohmlet-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ohmlet-red px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {connecting ? 'Connecting' : 'Live'}
          </span>
          <h1 className="text-xl font-black tracking-tight">{liveTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          {!unlimited && (
            <span
              className={`rounded-full border-2 px-3 py-1.5 text-xs font-black ${
                lowTime ? 'border-ohmlet-red bg-[#fdece8] text-ohmlet-red' : 'border-ohmlet-line bg-white text-ohmlet-ink-soft'
              }`}
            >
              {Math.floor(liveMinutesRemaining)} min left this month
            </span>
          )}
          {lowTime && onUpgrade && (
            <button
              onClick={onUpgrade}
              className="rounded-full border-2 border-ohmlet-ink bg-ohmlet-gold px-3 py-1.5 text-xs font-black text-ohmlet-ink shadow-press-sm transition-all hover:translate-y-[2px] hover:shadow-none"
            >
              Upgrade
            </button>
          )}
          <button
            onClick={disconnect}
            className="inline-flex items-center gap-2 rounded-2xl border-[2.5px] border-ohmlet-ink bg-white px-4 py-2 text-sm font-black text-ohmlet-red shadow-press-sm transition-all hover:translate-y-[2px] hover:shadow-none"
          >
            <PhoneOff className="h-4 w-4" /> End session
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Camera hero */}
        <div>
          <div className="relative overflow-hidden rounded-[1.6rem] border-[3px] border-ohmlet-ink bg-ohmlet-ink shadow-press">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full bg-ohmlet-ink object-cover" />
            {!camOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
                <CameraOff className="h-10 w-10" />
                <p className="text-sm font-bold">Camera is off. Turn it on so the tutor can see your bench.</p>
              </div>
            )}

            {/* Stage badge */}
            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white backdrop-blur">
              {STAGES.find((s) => s.id === stage)?.label}
            </div>

            {/* Speaking indicator */}
            <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              <Volume2 className="h-3.5 w-3.5 text-ohmlet-gold" /> Tutor audio on
            </div>

            {/* Overlaid controls */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent p-4">
              <ControlButton on={micOn} onClick={toggleMic} onIcon={Mic} offIcon={MicOff} label={micOn ? 'Mute' : 'Unmute'} />
              <ControlButton on={camOn} onClick={toggleCam} onIcon={Camera} offIcon={CameraOff} label={camOn ? 'Camera off' : 'Camera on'} />
              {camOn && (
                <>
                  <button
                    onClick={snapNow}
                    aria-label="Show the tutor this product now"
                    className={`flex h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-black transition-all hover:scale-105 ${
                      snapped ? 'border-ohmlet-green bg-ohmlet-green text-white' : 'border-white bg-white text-ohmlet-ink'
                    }`}
                  >
                    <Focus className="h-5 w-5" /> {snapped ? 'Sent' : 'Look now'}
                  </button>
                  <button
                    onClick={switchCamera}
                    aria-label="Switch camera"
                    title={facing === 'environment' ? 'Using rear camera' : 'Using front camera'}
                    className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 bg-black/40 text-white backdrop-blur transition-all hover:scale-105"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stage stepper */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {STAGES.map((s) => {
              const Icon = s.icon;
              const on = stage === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStageAndNotify(s.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center transition-all ${
                    on ? 'border-ohmlet-ink bg-ohmlet-gold shadow-press-sm' : 'border-ohmlet-line bg-white text-ohmlet-ink-soft hover:border-ohmlet-ink hover:text-ohmlet-ink'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-black">{s.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-sm font-semibold text-ohmlet-ink-soft">
            {STAGES.find((s) => s.id === stage)?.hint}
          </p>

          <div className="mt-4 rounded-2xl border-2 border-ohmlet-line bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ohmlet-ink-soft">Expected action</p>
                <p className="mt-1 text-sm font-black text-ohmlet-ink">
                  {currentStep ? `Step ${currentStep.id}: ${currentStep.instruction}` : 'Show the device and ask the tutor to define the next safe step.'}
                </p>
              </div>
              <button type="button" onClick={verifyCurrentStep} disabled={!currentStep || !camOn || verifying} className="shrink-0 rounded-xl border-2 border-ohmlet-ink bg-ohmlet-gold px-3 py-2 text-xs font-black shadow-press-sm disabled:cursor-not-allowed disabled:opacity-40">
                {verifying ? 'Verifying…' : 'Verify current action'}
              </button>
            </div>
            {verification && (
              <div className={`mt-3 rounded-xl border-2 px-3 py-3 ${verification.status === 'verified' ? 'border-ohmlet-green bg-[#eafaf0]' : verification.status === 'unsafe' ? 'border-ohmlet-red bg-[#fdece8]' : 'border-ohmlet-gold bg-ohmlet-gold-soft'}`}>
                <p className="text-xs font-black uppercase tracking-wide">{verification.status}</p>
                <p className="mt-1 text-sm font-semibold">Expected: Step {verification.expected_step}. Observed: {verification.observed_action}.</p>
                <p className="mt-1 text-sm font-black">{verification.next_instruction}</p>
              </div>
            )}
          </div>

        </div>

        {/* Transcript + input */}
        <div className="flex h-[520px] flex-col rounded-[1.6rem] border-2 border-ohmlet-line bg-white shadow-soft">
          <div className="flex items-center gap-2 border-b border-ohmlet-line px-5 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ohmlet-ink">
              <Zap className="h-4 w-4 text-ohmlet-gold" />
            </span>
            <h3 className="text-sm font-black tracking-tight">Conversation</h3>
          </div>

          <div className="ohmlet-chat-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {transcripts.length === 0 && (
              <p className="mt-6 text-center text-sm font-semibold text-ohmlet-ink-soft">
                Say hello, or tap a prompt below to get started.
              </p>
            )}
            {transcripts.map((t, i) => {
              if (t.role === 'system') {
                return (
                  <p key={i} className="text-center text-[11px] font-bold uppercase tracking-wide text-ohmlet-ink-soft/70">
                    {t.text}
                  </p>
                );
              }
              const mine = t.role === 'user';
              return (
                <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-semibold leading-snug ${
                      mine ? 'bg-ohmlet-gold text-ohmlet-ink' : 'border-2 border-ohmlet-line bg-ohmlet-cream text-ohmlet-ink'
                    }`}
                  >
                    {t.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2 border-t border-ohmlet-line px-4 pt-3">
            {quickPrompts.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border-2 border-ohmlet-line bg-white px-3 py-1.5 text-xs font-bold text-ohmlet-ink-soft transition-colors hover:border-ohmlet-ink hover:text-ohmlet-ink"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Text input (voice is primary; this is the fallback) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 p-4"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type if you cannot talk right now"
              className="flex-1 rounded-2xl border-2 border-ohmlet-line bg-ohmlet-cream px-4 py-2.5 text-sm font-semibold text-ohmlet-ink outline-none focus:border-ohmlet-ink"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-ohmlet-ink bg-ohmlet-gold text-ohmlet-ink shadow-press-sm transition-all enabled:hover:translate-y-[2px] enabled:hover:shadow-none disabled:opacity-40"
              aria-label="Send"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};

const ControlButton: React.FC<{
  on: boolean;
  onClick: () => void;
  onIcon: React.ComponentType<{ className?: string }>;
  offIcon: React.ComponentType<{ className?: string }>;
  label: string;
}> = ({ on, onClick, onIcon: OnIcon, offIcon: OffIcon, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all hover:scale-105 ${
      on ? 'border-white bg-white text-ohmlet-ink' : 'border-white/40 bg-black/40 text-white backdrop-blur'
    }`}
  >
    {on ? <OnIcon className="h-5 w-5" /> : <OffIcon className="h-5 w-5" />}
  </button>
);
