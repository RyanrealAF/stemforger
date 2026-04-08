import { useEffect, useRef } from 'react';

export default function Oscilloscope() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#e8b84b';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let x = 0; x < canvas.width; x++) {
        const y = (canvas.height / 2) + Math.sin(x * 0.05 + Date.now() * 0.01) * 20 * Math.random();
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="monitor h-[140px] bg-black border border-border relative overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full opacity-80" />
    </div>
  );
}
