import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

export type UiSoundVariant =
  | "default"
  | "nav"
  | "primary"
  | "toggle"
  | "page"
  | "destructive"
  | "modal"
  | "mascot";

type PlayOptions = {
  force?: boolean;
};

type ToneOptions = {
  start: number;
  duration: number;
  fromFrequency: number;
  toFrequency?: number;
  volume: number;
  attack?: number;
  type?: OscillatorType;
  detune?: number;
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  filterQ?: number;
};

type NoiseOptions = {
  start: number;
  duration: number;
  volume: number;
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  filterQ?: number;
};

type UiSoundContextValue = {
  muted: boolean;
  play: (variant?: UiSoundVariant, options?: PlayOptions) => void;
  setMuted: (nextMuted: boolean, options?: { announce?: boolean }) => void;
  toggleMuted: () => void;
};

const STORAGE_KEY = "bright-minds.ui-sound-muted";
const ACTIVE_MASTER_GAIN = 1.3;
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  "[role='button']",
  "[role='link']",
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "input[type='checkbox']",
  "input[type='radio']",
  "[data-sfx]",
].join(", ");
const UI_SOUND_VARIANTS: UiSoundVariant[] = [
  "default",
  "nav",
  "primary",
  "toggle",
  "page",
  "destructive",
  "modal",
  "mascot",
];

const UiSoundContext = createContext<UiSoundContextValue | null>(null);

class UiSoundEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private disabled = false;

  setMuted(muted: boolean) {
    this.muted = muted;

    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : ACTIVE_MASTER_GAIN, this.context.currentTime, 0.012);
    }
  }

  play(variant: UiSoundVariant = "default", options?: PlayOptions) {
    if (this.disabled || (this.muted && !options?.force)) {
      return;
    }

    void this.unlock().then((context) => {
      if (!context || !this.masterGain) {
        return;
      }

      const start = context.currentTime + 0.008;

      switch (variant) {
        case "nav":
          this.playNav(context, start);
          break;
        case "primary":
          this.playPrimary(context, start);
          break;
        case "toggle":
          this.playToggle(context, start);
          break;
        case "page":
          this.playPage(context, start);
          break;
        case "destructive":
          this.playDestructive(context, start);
          break;
        case "modal":
          this.playModal(context, start);
          break;
        case "mascot":
          this.playMascot(context, start);
          break;
        default:
          this.playDefault(context, start);
      }
    });
  }

  private async unlock() {
    const context = this.getContext();
    if (!context) {
      return null;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return null;
      }
    }

    return context;
  }

  private getContext() {
    if (this.disabled || typeof window === "undefined") {
      return null;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      this.disabled = true;
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.muted ? 0 : ACTIVE_MASTER_GAIN;
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  private ensureNoiseBuffer(context: AudioContext) {
    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }

    const durationSeconds = 0.18;
    const frameCount = Math.floor(context.sampleRate * durationSeconds);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      channelData[index] = Math.random() * 2 - 1;
    }

    this.noiseBuffer = buffer;
    return buffer;
  }

  private scheduleTone(context: AudioContext, options: ToneOptions) {
    if (!this.masterGain) {
      return;
    }

    const {
      start,
      duration,
      fromFrequency,
      toFrequency = fromFrequency,
      volume,
      attack = 0.004,
      type = "triangle",
      detune = 0,
      filterType,
      filterFrequency,
      filterQ = 0.8,
    } = options;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    let outputNode: AudioNode = oscillator;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(40, fromFrequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, toFrequency), start + duration);
    oscillator.detune.setValueAtTime(detune, start);

    if (filterType && filterFrequency) {
      const filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFrequency, start);
      filter.Q.setValueAtTime(filterQ, start);
      oscillator.connect(filter);
      outputNode = filter;
    }

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(volume, start + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    outputNode.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private scheduleNoise(context: AudioContext, options: NoiseOptions) {
    if (!this.masterGain) {
      return;
    }

    const {
      start,
      duration,
      volume,
      filterType = "bandpass",
      filterFrequency = 1200,
      filterQ = 0.9,
    } = options;
    const source = context.createBufferSource();
    const gainNode = context.createGain();
    const filter = context.createBiquadFilter();

    source.buffer = this.ensureNoiseBuffer(context);
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, start);
    filter.Q.setValueAtTime(filterQ, start);

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(volume, start + 0.006);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private playDefault(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.045,
      fromFrequency: 820,
      toFrequency: 520,
      volume: 0.024,
      type: "triangle",
    });
    this.scheduleTone(context, {
      start: start + 0.004,
      duration: 0.026,
      fromFrequency: 1400,
      toFrequency: 880,
      volume: 0.006,
      type: "sine",
    });
  }

  private playNav(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.05,
      fromFrequency: 650,
      toFrequency: 420,
      volume: 0.022,
      type: "triangle",
      filterType: "lowpass",
      filterFrequency: 1800,
    });
    this.scheduleTone(context, {
      start: start + 0.005,
      duration: 0.024,
      fromFrequency: 1080,
      toFrequency: 760,
      volume: 0.005,
      type: "sine",
    });
  }

  private playPrimary(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.07,
      fromFrequency: 520,
      toFrequency: 720,
      volume: 0.026,
      type: "triangle",
    });
    this.scheduleTone(context, {
      start: start + 0.028,
      duration: 0.06,
      fromFrequency: 760,
      toFrequency: 560,
      volume: 0.014,
      type: "sine",
    });
  }

  private playToggle(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.035,
      fromFrequency: 430,
      toFrequency: 560,
      volume: 0.02,
      type: "sine",
    });
    this.scheduleTone(context, {
      start: start + 0.018,
      duration: 0.03,
      fromFrequency: 620,
      toFrequency: 760,
      volume: 0.01,
      type: "triangle",
    });
  }

  private playPage(context: AudioContext, start: number) {
    this.scheduleNoise(context, {
      start,
      duration: 0.045,
      volume: 0.006,
      filterType: "bandpass",
      filterFrequency: 1500,
      filterQ: 1.4,
    });
    this.scheduleTone(context, {
      start: start + 0.004,
      duration: 0.095,
      fromFrequency: 360,
      toFrequency: 180,
      volume: 0.016,
      type: "triangle",
      filterType: "lowpass",
      filterFrequency: 1200,
    });
  }

  private playDestructive(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.1,
      fromFrequency: 240,
      toFrequency: 120,
      volume: 0.026,
      type: "sine",
      filterType: "lowpass",
      filterFrequency: 680,
    });
    this.scheduleNoise(context, {
      start,
      duration: 0.03,
      volume: 0.004,
      filterType: "lowpass",
      filterFrequency: 380,
      filterQ: 0.7,
    });
  }

  private playModal(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.07,
      fromFrequency: 340,
      toFrequency: 520,
      volume: 0.02,
      type: "triangle",
    });
    this.scheduleTone(context, {
      start: start + 0.012,
      duration: 0.05,
      fromFrequency: 760,
      toFrequency: 640,
      volume: 0.007,
      type: "sine",
    });
  }

  private playMascot(context: AudioContext, start: number) {
    this.scheduleTone(context, {
      start,
      duration: 0.22,
      fromFrequency: 190,
      toFrequency: 620,
      volume: 0.02,
      type: "triangle",
      filterType: "lowpass",
      filterFrequency: 1100,
      filterQ: 0.9,
    });
    this.scheduleTone(context, {
      start: start + 0.02,
      duration: 0.18,
      fromFrequency: 260,
      toFrequency: 480,
      volume: 0.008,
      type: "sawtooth",
      detune: 8,
      filterType: "bandpass",
      filterFrequency: 900,
      filterQ: 1.2,
    });
  }
}

const soundEngine = new UiSoundEngine();

function readMutedPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMutedPreference(muted: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Ignore storage errors and keep the in-memory state working.
  }
}

function isUiSoundVariant(value: string | null | undefined): value is UiSoundVariant {
  return value ? UI_SOUND_VARIANTS.includes(value as UiSoundVariant) : false;
}

function resolveInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
}

function isDisabledElement(element: HTMLElement) {
  if (element.dataset.sfxDisabled === "true") {
    return true;
  }

  if (element.getAttribute("aria-disabled") === "true") {
    return true;
  }

  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.disabled;
  }

  return false;
}

function resolveVariant(element: HTMLElement): UiSoundVariant {
  if (isUiSoundVariant(element.dataset.sfx)) {
    return element.dataset.sfx;
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      return "toggle";
    }
  }

  if (element.tagName === "A" || element.getAttribute("role") === "link") {
    return "nav";
  }

  return "default";
}

export function UiSoundProvider({ children }: PropsWithChildren) {
  const [muted, setMutedState] = useState(readMutedPreference);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
    soundEngine.setMuted(muted);
    writeMutedPreference(muted);
  }, [muted]);

  const play = useCallback((variant: UiSoundVariant = "default", options?: PlayOptions) => {
    soundEngine.play(variant, options);
  }, []);

  const setMuted = useCallback(
    (nextMuted: boolean, options?: { announce?: boolean }) => {
      mutedRef.current = nextMuted;
      setMutedState(nextMuted);
      soundEngine.setMuted(nextMuted);

      if (!nextMuted && options?.announce !== false) {
        soundEngine.play("toggle", { force: true });
      }
    },
    [],
  );

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current);
  }, [setMuted]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!event.isTrusted) {
        return;
      }

      const interactiveElement = resolveInteractiveElement(event.target);
      if (!interactiveElement) {
        return;
      }

      if (interactiveElement.dataset.sfxIgnore === "true" || isDisabledElement(interactiveElement)) {
        return;
      }

      play(resolveVariant(interactiveElement));
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [play]);

  const value = useMemo<UiSoundContextValue>(
    () => ({
      muted,
      play,
      setMuted,
      toggleMuted,
    }),
    [muted, play, setMuted, toggleMuted],
  );

  return <UiSoundContext.Provider value={value}>{children}</UiSoundContext.Provider>;
}

export function useUiSound() {
  const context = useContext(UiSoundContext);

  if (!context) {
    throw new Error("useUiSound must be used within UiSoundProvider");
  }

  return context;
}