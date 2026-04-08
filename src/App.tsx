import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { logForgeEvent } from './firebase';

const API_BASE = 'https://ryanrealaf-stemforge.hf.space';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'forging' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus('idle');
      setProgress(0);
      logForgeEvent('file_loaded', { name: selectedFile.name, size: selectedFile.size });
    }
  };

  const startForge = async () => {
    if (!file) return;

    setStatus('forging');
    setProgress(0);
    logForgeEvent('process_start', { file_name: file.name });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      setJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (error) {
      console.error('Forge error:', error);
      setStatus('error');
      logForgeEvent('process_error', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/status/${id}`);
        if (!response.ok) throw new Error('Status check failed');
        
        const data = await response.json();
        
        if (data.status === 'complete') {
          clearInterval(interval);
          setStatus('success');
          setProgress(100);
          logForgeEvent('process_complete', { job_id: id });
        } else {
          setProgress(data.progress || 0);
        }
      } catch (error) {
        clearInterval(interval);
        setStatus('error');
        console.error('Polling error:', error);
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen flex justify-center items-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="console-frame w-full max-w-[1100px] bg-panel border-[3px] border-border p-[30px] grid grid-rows-[auto_1fr_auto] gap-[25px] shadow-[20px_20px_0px_#000]"
      >
        <div className="header flex justify-between items-end border-b-2 border-border pb-[10px]">
          <div className="brand text-[32px] font-bold tracking-[8px] text-accent uppercase">
            STEMFORGER
          </div>
          <div className="meta font-mono text-[10px] text-border text-right">
            PROJECT: AI-SONG-WRITING<br />
            ACTIVE ENGINE: HF-DEMUCS
          </div>
        </div>

        <div className="action-bar flex gap-[10px]">
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="audio/*" 
            onChange={handleFileChange}
          />
          <button 
            className="btn flex-1 bg-accent text-black border-none p-[20px] font-cond font-bold text-[20px] tracking-[5px] uppercase transition-all hover:bg-white disabled:bg-border disabled:text-[#444] disabled:cursor-not-allowed"
            onClick={() => fileInputRef.current?.click()}
          >
            LOAD
          </button>
          <button 
            className="btn flex-1 bg-accent text-black border-none p-[20px] font-cond font-bold text-[20px] tracking-[5px] uppercase transition-all hover:bg-white disabled:bg-border disabled:text-[#444] disabled:cursor-not-allowed"
            disabled={!file || status === 'forging'}
            onClick={startForge}
          >
            {status === 'idle' && 'FORGE'}
            {status === 'forging' && `FORGING... ${progress}%`}
            {status === 'success' && 'SUCCESS'}
            {status === 'error' && 'RETRY'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
