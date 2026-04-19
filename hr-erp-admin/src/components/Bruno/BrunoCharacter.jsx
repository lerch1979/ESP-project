import React, { useState, useEffect } from 'react';
import brunoImg from '../../assets/bruno/bruno-base.jpg';
import './Bruno.css';

export default function BrunoCharacter({ state = 'idle', size = 120, showLabel = false, interactive = true }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`bruno-wrapper ${hovered ? 'hovered' : ''}`}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
    >
      <div className={`bruno-animated ${state}`}>
        <img
          src={brunoImg}
          alt="Bruno"
          className="bruno-img"
          style={{ width: size, height: 'auto' }}
          draggable={false}
        />
      </div>

      {/* Thought bubble when thinking */}
      {state === 'thinking' && (
        <div className="bruno-thought">
          <span className="bruno-thought-text">?</span>
          <div className="bruno-thought-dot dot1" />
          <div className="bruno-thought-dot dot2" />
        </div>
      )}

      {/* Music notes when dancing */}
      {state === 'dancing' && (
        <div className="bruno-notes">
          <span className="bruno-note n1">{'\u266A'}</span>
          <span className="bruno-note n2">{'\u266B'}</span>
          <span className="bruno-note n3">{'\u266A'}</span>
        </div>
      )}

      {/* Celebration particles */}
      {state === 'celebrating' && (
        <div className="bruno-particles">
          <span className="bruno-particle p1">{'\u2764'}</span>
          <span className="bruno-particle p2">{'\u2728'}</span>
          <span className="bruno-particle p3">{'\u2728'}</span>
        </div>
      )}

      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 2, letterSpacing: 0.5 }}>
          Bruno
        </span>
      )}
    </div>
  );
}
