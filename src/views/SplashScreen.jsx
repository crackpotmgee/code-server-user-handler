import React, { useState, useEffect } from 'react';

const SplashScreen = ({ inputSteps }) => {
  const [steps, setSteps] = useState(inputSteps || []);

  useEffect(() => {
    setSteps(inputSteps || []);
  }, [inputSteps]); // Add inputSteps as a dependency

  return (
    <div className="splash-screen">
      <h1>Setup in Progress</h1>
      <ul>
        {steps.map((step) => (
          <li key={step.label} className={step.status}>
            {step.label} - {step.status}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SplashScreen;