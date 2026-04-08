interface FaderProps {
  label: string;
  accent?: boolean;
  dual?: boolean;
}

export default function Fader({ label, accent = false, dual = true }: FaderProps) {
  return (
    <div className={`fader-cell bg-raised border flex flex-col items-center p-[15px_5px] ${accent ? 'border-accent' : 'border-border'}`}>
      <div className="v-track flex gap-1 h-[180px]">
        <input type="range" className="v-slider" defaultValue={50} />
        {dual && <input type="range" className="v-slider" defaultValue={50} />}
      </div>
      <div className={`fader-label mt-[10px] font-bold text-[12px] tracking-[2px] uppercase ${accent ? 'text-accent' : ''}`}>
        {label}
      </div>
    </div>
  );
}
