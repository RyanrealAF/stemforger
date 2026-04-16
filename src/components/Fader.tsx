import React from 'react';

interface FaderProps {
  label: string;
  value: number; // 0-100
  onChange: (val: number) => void;
  accentColor?: string;
}

export default function Fader({ label, value, onChange, accentColor = '#e8b84b' }: FaderProps) {
  return (
    <div className="fader-wrap flex flex-col items-center gap-2">
      <div className="fader-track w-[24px] h-[160px] bg-[#111] border border-[#2e3136] rounded-sm relative flex flex-col items-center py-2">
        <div
          className="fader-fill absolute bottom-0 w-full opacity-20"
          style={{
            height: `${value}%`,
            backgroundColor: accentColor
          }}
        />
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="v-slider"
        />
      </div>
      <div className="flex flex-col items-center">
        <span className="fader-val font-mono text-[11px] text-[#e8b84b]">{value}</span>
        <span className="fader-label font-bold text-[10px] tracking-[2px] uppercase text-[#d1d1d1] mt-1">
          {label}
        </span>
      </div>
    </div>
  );
}
