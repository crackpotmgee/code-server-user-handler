import React, { useState, useEffect } from 'react';

const SplashScreen = ({ steps }) => {
  return (
    <div className="splash-screen">
      <h1>Setup in Progress</h1>
      <ul>
        {steps.map((step) => (
          <li key={step.label} className={step.completed ? 'completed' : ''}>
            {step.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SplashScreen;
