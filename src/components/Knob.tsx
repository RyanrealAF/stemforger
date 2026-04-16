import React, { useState, useRef, useEffect, useCallback } from 'react';

interface KnobProps {
  label: string;
  value: number; // 0-100
  onChange: (val: number) => void;
  color?: string;
}

export default function Knob({ label, value, onChange, color = '#e8b84b' }: KnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const delta = (startYRef.current - clientY) * 1.2;
    const newVal = Math.max(0, Math.min(100, startValRef.current + delta));
    onChange(Math.round(newVal));
  }, [onChange]);

  const onUp = useCallback(() => {
    setIsDragging(false);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }, [onMove]);

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startValRef.current = value;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const rotation = -135 + (value / 100) * 270;

  return (
    <div className="knob-wrap flex flex-col items-center gap-1">
      <div 
        className="knob w-[40px] h-[40px] rounded-full border-2 border-[#2e3136] relative cursor-ns-resize select-none"
        onMouseDown={onDown}
        onTouchStart={onDown}
        style={{ 
          background: 'radial-gradient(circle at 30% 30%, #333, #111)',
        }}
      >
        <div
          className="absolute top-[3px] left-1/2 w-[2px] h-[10px] -translate-x-1/2 origin-[50%_17px]"
          style={{
            backgroundColor: color,
            transform: `rotate(${rotation}deg)`
          }}
        />
      </div>
      <span className="knob-label font-mono text-[9px] uppercase text-[#e8b84b] tracking-wider">
        {label}
      </span>
    </div>
  );
}
