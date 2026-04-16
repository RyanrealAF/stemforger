import { useCallback, useRef, useState, useEffect } from 'react';

export type StemType = 'vocals' | 'drums' | 'bass' | 'other';

interface StemNodes {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  eqHi: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqLo: BiquadFilterNode;
  analyzer: AnalyserNode;
}

export function useAudioEngine() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyzerRef = useRef<AnalyserNode | null>(null);
  const stemsRef = useRef<Record<StemType, StemNodes> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0);

  const init = useCallback(() => {
    if (audioContextRef.current) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    const masterGain = ctx.createGain();
    const masterAnalyzer = ctx.createAnalyser();
    masterAnalyzer.fftSize = 2048;

    masterGain.connect(masterAnalyzer);
    masterAnalyzer.connect(ctx.destination);

    masterGainRef.current = masterGain;
    masterAnalyzerRef.current = masterAnalyzer;

    const stems: any = {};
    (['vocals', 'drums', 'bass', 'other'] as StemType[]).forEach((name) => {
      const gain = ctx.createGain();
      const eqHi = ctx.createBiquadFilter();
      const eqMid = ctx.createBiquadFilter();
      const eqLo = ctx.createBiquadFilter();
      const analyzer = ctx.createAnalyser();

      eqHi.type = 'highshelf';
      eqHi.frequency.value = 5000;

      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1;

      eqLo.type = 'lowshelf';
      eqLo.frequency.value = 200;

      // Routing: Source -> EQ Lo -> EQ Mid -> EQ Hi -> Gain -> Stem Analyzer -> Master Gain
      eqLo.connect(eqMid);
      eqMid.connect(eqHi);
      eqHi.connect(gain);
      gain.connect(analyzer);
      analyzer.connect(masterGain);

      stems[name] = { source: null, gain, eqHi, eqMid, eqLo, analyzer };
    });

    stemsRef.current = stems;
  }, []);

  const loadStems = useCallback(async (stemUrls: Record<StemType, string>) => {
    init();
    const ctx = audioContextRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();

    setIsLoaded(false);

    const stems = stemsRef.current!;
    const promises = (Object.keys(stemUrls) as StemType[]).map(async (name) => {
      const response = await fetch(stemUrls[name]);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      if (stems[name].source) {
        try { stems[name].source?.stop(); } catch(e) {}
      }

      return { name, audioBuffer };
    });

    const results = await Promise.all(promises);
    results.forEach(({ name, audioBuffer }) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(stems[name].eqLo);
      stems[name].source = source;
    });

    setIsLoaded(true);
  }, [init]);

  const play = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !isLoaded || isPlaying) return;

    if (ctx.state === 'suspended') ctx.resume();

    const stems = stemsRef.current!;
    const startTime = ctx.currentTime + 0.1;

    (Object.keys(stems) as StemType[]).forEach((name) => {
      const oldSource = stems[name].source;
      const newSource = ctx.createBufferSource();
      newSource.buffer = oldSource?.buffer || null;
      newSource.connect(stems[name].eqLo);
      stems[name].source = newSource;
      newSource.start(startTime);
    });

    setIsPlaying(true);
  }, [isLoaded, isPlaying]);

  const pause = useCallback(() => {
    if (!isPlaying) return;
    const stems = stemsRef.current!;
    (Object.keys(stems) as StemType[]).forEach((name) => {
      try { stems[name].source?.stop(); } catch(e) {}
    });
    setIsPlaying(false);
  }, [isPlaying]);

  const setVolume = useCallback((stem: StemType, val: number) => {
    if (!stemsRef.current) return;
    // val 0-100
    stemsRef.current[stem].gain.gain.setTargetAtTime(val / 100, audioContextRef.current!.currentTime, 0.05);
  }, []);

  const setEQ = useCallback((stem: StemType, band: 'hi' | 'mid' | 'lo', val: number) => {
    if (!stemsRef.current) return;
    // val 0-100, map to dB -12 to +12
    const db = (val / 50 - 1) * 12;
    const node = band === 'hi' ? stemsRef.current[stem].eqHi : band === 'mid' ? stemsRef.current[stem].eqMid : stemsRef.current[stem].eqLo;
    node.gain.setTargetAtTime(db, audioContextRef.current!.currentTime, 0.05);
  }, []);

  return {
    loadStems,
    play,
    pause,
    isPlaying,
    isLoaded,
    setVolume,
    setEQ,
    masterAnalyzer: masterAnalyzerRef.current,
    stems: stemsRef.current
  };
}
