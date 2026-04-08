interface KnobProps {
  label: string;
  rotation?: number;
}

export default function Knob({ label, rotation = 0 }: KnobProps) {
  return (
    <div className="knob-row flex gap-[15px] items-center">
      <div 
        className="knob w-[50px] h-[50px] rounded-full border-2 border-border relative"
        style={{ 
          background: 'radial-gradient(circle at 30% 30%, #333, #000)',
          transform: `rotate(${rotation}deg)` 
        }}
      >
        <div className="absolute top-[5px] left-1/2 w-[2px] h-[10px] bg-accent -translate-x-1/2" />
      </div>
      <div className="knob-label font-mono text-[11px] uppercase text-accent">
        {label}
      </div>
    </div>
  );
}
