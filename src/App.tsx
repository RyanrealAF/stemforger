import React, { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { Upload, Activity, Download, Play, Pause, AlertTriangle, CheckCircle2, Music } from 'lucide-react';
import { useAudioEngine, StemType } from './hooks/useAudioEngine';
import Knob from './components/Knob';
import Fader from './components/Fader';
import Oscilloscope from './components/Oscilloscope';

const API = 'https://ryanrealaf-stemforge.hf.space';

interface StemState {
  volume: number;
  eqHi: number;
  eqMid: number;
  eqLo: number;
  url: string;
  isReady: boolean;
}

export default function App() {
  const { loadStems, play, pause, isPlaying, isLoaded, setVolume, setEQ, masterAnalyzer } = useAudioEngine();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState('IDLE');
  const [logMsg, setLogMsg] = useState('StemForge v2.0 — Initializing');
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingTime, setProcessingTime] = useState('—');
  const [error, setError] = useState<string | null>(null);

  const [stems, setStems] = useState<Record<StemType, StemState>>({
    vocals: { volume: 80, eqHi: 50, eqMid: 50, eqLo: 50, url: '', isReady: false },
    drums: { volume: 80, eqHi: 50, eqMid: 50, eqLo: 50, url: '', isReady: false },
    bass: { volume: 80, eqHi: 50, eqMid: 50, eqLo: 50, url: '', isReady: false },
    other: { volume: 80, eqHi: 50, eqMid: 50, eqLo: 50, url: '', isReady: false },
  });

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const ping = async () => {
      try {
        const r = await fetch(`${API}/`);
        const d = await r.json();
        const ok = d.status === 'ok';
        setIsBackendOnline(ok);
        setLogMsg(ok ? 'StemForge v2.0 — Backend online' : 'StemForge v2.0 — Backend offline');
      } catch (e) {
        setIsBackendOnline(false);
        setLogMsg('StemForge v2.0 — Backend unreachable');
      }
    };
    ping();
  }, []);

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setStatus('LOADED');
    setLogMsg(`Track loaded — ${file.name}`);
    setError(null);
  };

  const startProcessing = async () => {
    if (!selectedFile) return;

    setStatus('PROCESSING');
    setError(null);
    setProgress(4);
    setProcessingTime('0:00');
    setLogMsg('Uploading track...');

    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      setProcessingTime(`${m}:${s.toString().padStart(2, '0')}`);
      setProgress(Math.min(4 + (elapsed / 300) * 87, 91));
      if (elapsed > 10) setLogMsg('Demucs processing — CPU mode');
    }, 1000);

    const fd = new FormData();
    fd.append('file', selectedFile);

    try {
      const r = await fetch(`${API}/separate`, { method: 'POST', body: fd });
      if (timerRef.current) clearInterval(timerRef.current);

      if (!r.ok) {
        let em = 'Separation failed';
        try { const ed = await r.json(); em = ed.error || em; } catch (e) {}
        throw new Error(em);
      }

      const zipBlob = await r.blob();
      setLogMsg('Extracting stems...');

      const zip = await JSZip.loadAsync(zipBlob);
      const stemUrls: any = {};
      const newStems = { ...stems };

      for (const stem of ['vocals', 'drums', 'bass', 'other'] as StemType[]) {
        const file = zip.file(`${stem}.wav`);
        if (file) {
          const blob = await file.async('blob');
          const url = URL.createObjectURL(blob);
          stemUrls[stem] = url;
          newStems[stem] = { ...newStems[stem], url, isReady: true };
        }
      }

      setStems(newStems);
      setLogMsg('Decoding audio buffers...');
      await loadStems(stemUrls);

      setStatus('COMPLETE');
      setProgress(100);
      setLogMsg('Separation complete — Mixer active');
    } catch (e: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      setStatus('ERROR');
      setError(e.message || 'Network error');
      setLogMsg('Separation failed');
    }
  };

  const updateStem = (name: StemType, key: keyof StemState, val: any) => {
    setStems(prev => ({
      ...prev,
      [name]: { ...prev[name], [key]: val }
    }));

    if (key === 'volume') setVolume(name, val);
    if (key === 'eqHi') setEQ(name, 'hi', val);
    if (key === 'eqMid') setEQ(name, 'mid', val);
    if (key === 'eqLo') setEQ(name, 'lo', val);
  };

  return (
    <div className="min-h-screen bg-[#111213] text-[#d1d1d1] font-['Barlow_Condensed'] flex flex-col items-center p-4 md:p-8">

      {/* HEADER */}
      <div className="w-full max-w-6xl flex justify-between items-end mb-8 border-b border-[#2e3136] pb-4">
        <div>
          <h1 className="text-4xl font-bold tracking-[4px] text-white flex items-center gap-3">
            STEM<span className="text-[#e8b84b]">FORGE</span>
            <Activity className="text-[#e8b84b]" size={32} />
          </h1>
          <p className="font-mono text-xs tracking-[2px] opacity-50 uppercase mt-1">AI Audio Separation Studio · v2.0</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className={`w-2 h-2 rounded-full ${isBackendOnline ? 'bg-green-500 shadow-[0_0_8px_green]' : 'bg-red-500 shadow-[0_0_8px_red]'}`} />
              <span className="font-mono text-[10px] tracking-widest">{isBackendOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <p className="text-[9px] opacity-40 uppercase tracking-tighter">HTDEMUCS-4S Backend</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT: DECK & PROGRESS */}
        <div className="lg:col-span-4 space-y-6">
          <div
            className={`deck-rack border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center transition-all cursor-pointer h-[240px]
              ${status === 'IDLE' ? 'border-[#2e3136] hover:border-[#e8b84b] hover:bg-[#1a1c1e]' : 'border-[#e8b84b] bg-[#1a1c1e]'}
            `}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-[#1a1c1e]'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('bg-[#1a1c1e]'); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('bg-[#1a1c1e]');
              const f = e.dataTransfer.files[0];
              if (f) handleFileChange(f);
            }}
            onClick={() => document.getElementById('fileInput')?.click()}
          >
            <input
              id="fileInput"
              type="file"
              className="hidden"
              accept="audio/*"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            />

            {status === 'IDLE' ? (
              <>
                <Upload size={48} className="text-[#2e3136] mb-4" />
                <span className="text-sm tracking-widest uppercase font-bold">Drop Audio Track</span>
                <span className="text-[10px] opacity-40 mt-1">MP3, WAV, FLAC (Max 20MB)</span>
              </>
            ) : (
              <div className="text-center">
                <Music size={48} className="text-[#e8b84b] mb-4 mx-auto" />
                <span className="text-sm tracking-widest uppercase font-bold block truncate max-w-[200px]">{selectedFile?.name}</span>
                <span className="text-[10px] text-[#e8b84b] uppercase mt-1 tracking-widest">LOADED</span>
              </div>
            )}
          </div>

          <button
            disabled={!selectedFile || status === 'PROCESSING'}
            onClick={startProcessing}
            className={`w-full py-4 rounded font-bold tracking-[3px] uppercase transition-all flex items-center justify-center gap-3
              ${!selectedFile || status === 'PROCESSING'
                ? 'bg-[#1a1c1e] text-[#2e3136] cursor-not-allowed'
                : 'bg-[#e8b84b] text-black hover:bg-white active:scale-95 shadow-[0_0_20px_rgba(232,184,75,0.2)]'}
            `}
          >
            {status === 'PROCESSING' ? (
              <>
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Separating...
              </>
            ) : 'Separate Stems'}
          </button>

          {(status === 'PROCESSING' || status === 'COMPLETE' || status === 'ERROR') && (
            <div className="bg-[#1a1c1e] border border-[#2e3136] p-4 rounded space-y-3">
              <div className="flex justify-between items-center text-[10px] tracking-widest uppercase font-bold">
                <span>{status === 'COMPLETE' ? 'PROCESS COMPLETE' : status === 'ERROR' ? 'PROCESS FAILED' : 'PROCESSING ENGINE'}</span>
                <span>{processingTime}</span>
              </div>
              <div className="h-1 bg-black rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${status === 'ERROR' ? 'bg-red-500' : 'bg-[#e8b84b]'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 text-red-400 text-[11px] leading-tight">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: MIXER & MONITOR */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {(['vocals', 'drums', 'bass', 'other'] as StemType[]).map((name) => {
              const s = stems[name];
              const colors = {
                vocals: '#e84b9a',
                drums: '#e8b84b',
                bass: '#4be8c8',
                other: '#9a6be8'
              };
              return (
                <div key={name} className="bg-[#1a1c1e] border border-[#2e3136] p-4 rounded flex flex-col items-center gap-6">
                  <div className="w-full flex justify-between items-center mb-2">
                    <span className="font-bold text-xs tracking-widest uppercase text-white">{name.slice(0, 3)}</span>
                    <div className={`w-2 h-2 rounded-full ${s.isReady ? 'bg-green-500 shadow-[0_0_5px_green]' : 'bg-[#2e3136]'}`} />
                  </div>

                  <div className="space-y-4 w-full flex flex-col items-center">
                    <Knob label="HI" value={s.eqHi} onChange={(v) => updateStem(name, 'eqHi', v)} color={colors[name]} />
                    <Knob label="MID" value={s.eqMid} onChange={(v) => updateStem(name, 'eqMid', v)} color={colors[name]} />
                    <Knob label="LO" value={s.eqLo} onChange={(v) => updateStem(name, 'eqLo', v)} color={colors[name]} />
                  </div>

                  <Fader label="LEVEL" value={s.volume} onChange={(v) => updateStem(name, 'volume', v)} accentColor={colors[name]} />

                  {s.isReady && (
                    <a
                      href={s.url}
                      download={`${name}.wav`}
                      className="text-[9px] uppercase tracking-widest text-[#e8b84b] hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Download size={10} /> Download
                    </a>
                  )}
                </div>
              )
            })}
          </div>

          <div className="bg-[#1a1c1e] border border-[#2e3136] p-6 rounded relative">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-6">
                <button
                  onClick={isPlaying ? pause : play}
                  disabled={!isLoaded}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${isLoaded ? 'bg-[#e8b84b] text-black hover:scale-110 active:scale-95' : 'bg-[#2e3136] text-[#1a1c1e] cursor-not-allowed'}
                  `}
                >
                  {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
                </button>
                <div>
                  <h3 className="text-white font-bold tracking-widest uppercase text-sm">Master Output</h3>
                  <p className="text-[10px] opacity-40 uppercase tracking-[2px]">{isPlaying ? 'Streaming Audio Data' : 'Ready to Monitor'}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs text-[#e8b84b] block">REAL-TIME ANALYZER</span>
                <span className="text-[9px] opacity-30 uppercase tracking-widest">FFT SIZE: 2048</span>
              </div>
            </div>

            <Oscilloscope analyser={masterAnalyzer} />
          </div>
        </div>

      </div>

      {/* FOOTER / CONSOLE */}
      <div className="w-full max-w-6xl mt-auto pt-8 border-t border-[#2e3136] flex justify-between items-center font-mono text-[10px] tracking-widest opacity-50">
        <div className="flex gap-4">
          <span>{logMsg.toUpperCase()}</span>
          <span className="text-[#e8b84b]">●</span>
          <span>4-STEM SEPARATION</span>
        </div>
        <div>
          STEMFORGE STUDIO · 2024
        </div>
      </div>

    </div>
  );
}
