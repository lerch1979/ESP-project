import React from 'react';
import './Bruno.css';

const BearSVG = ({ state, size = 64 }) => {
  const eyeOpen = state !== 'happy';
  const mouthHappy = state === 'happy' || state === 'talking';

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <circle cx="25" cy="22" r="14" fill="#8B6914" />
      <circle cx="75" cy="22" r="14" fill="#8B6914" />
      <circle cx="25" cy="22" r="8" fill="#D4A853" />
      <circle cx="75" cy="22" r="8" fill="#D4A853" />

      {/* Head */}
      <circle cx="50" cy="48" r="32" fill="#C4922A" />

      {/* Face lighter area */}
      <ellipse cx="50" cy="55" rx="20" ry="18" fill="#E8C968" />

      {/* Eyes */}
      {eyeOpen ? (
        <>
          <circle cx="38" cy="43" r="4" fill="#2C1810" />
          <circle cx="62" cy="43" r="4" fill="#2C1810" />
          <circle cx="39.5" cy="41.5" r="1.5" fill="#fff" />
          <circle cx="63.5" cy="41.5" r="1.5" fill="#fff" />
        </>
      ) : (
        <>
          <path d="M34 43 Q38 39 42 43" stroke="#2C1810" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M58 43 Q62 39 66 43" stroke="#2C1810" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </>
      )}

      {/* Nose */}
      <ellipse cx="50" cy="52" rx="5" ry="3.5" fill="#2C1810" />
      <ellipse cx="48.5" cy="51" rx="1.5" ry="1" fill="#5C4030" />

      {/* Mouth */}
      {mouthHappy ? (
        <path d="M42 58 Q50 66 58 58" stroke="#2C1810" strokeWidth="2" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M44 59 Q50 62 56 59" stroke="#2C1810" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      )}

      {/* Blush */}
      <ellipse cx="32" cy="54" rx="5" ry="3" fill="#E8A0A0" opacity="0.4" />
      <ellipse cx="68" cy="54" rx="5" ry="3" fill="#E8A0A0" opacity="0.4" />

      {/* Body */}
      <ellipse cx="50" cy="85" rx="22" ry="16" fill="#C4922A" />
      <ellipse cx="50" cy="85" rx="14" ry="10" fill="#E8C968" />
    </svg>
  );
};

export default function BrunoCharacter({ state = 'idle', size = 64, showLabel = false }) {
  return (
    <div className="bruno-wrapper">
      <div className={`bruno-animated ${state}`}>
        <BearSVG state={state} size={size} />
      </div>
      {showLabel && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: -2, letterSpacing: 0.5 }}>
          Bruno
        </span>
      )}
    </div>
  );
}
