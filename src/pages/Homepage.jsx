import React, { useState, useEffect } from 'react';

const Home = () => {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  function getTimeLeft() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(14, 0, 0, 0); // 2:00 PM today
    const diff = target - now;
    if (diff <= 0) return null;
    return {
      hours: Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  }

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, []);

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">
      {timeLeft ? (
        <>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4 font-mono">
            Competition starts in
          </p>
          <div className="flex items-center gap-3 font-mono">
            {[
              { value: timeLeft.hours, label: 'hrs' },
              { value: timeLeft.minutes, label: 'min' },
              { value: timeLeft.seconds, label: 'sec' },
            ].map(({ value, label }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <span className="text-4xl font-black text-slate-300">:</span>}
                <div className="flex flex-col items-center">
                  <span className="text-6xl font-black text-violet-700 tabular-nums">
                    {pad(value)}
                  </span>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mt-1">
                    {label}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className="text-5xl font-black text-violet-700 font-mono mb-2">GO!</p>
          <p className="text-sm text-slate-400 font-mono">The competition has started</p>
        </div>
      )}
    </div>
  );
};

export default Home;
