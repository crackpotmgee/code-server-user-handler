import React, { useState, useEffect } from 'react';

const SplashScreen = () => {
  const [steps, setSteps] = useState([
    { label: 'Checking user profile...', completed: false },
    { label: 'Creating user profile...', completed: false },
    { label: 'Adding user to group...', completed: false },
    { label: 'Starting codeserver user instance...', completed: false },
  ]);

  useEffect(() => {
    const updateStep = (index) => {
      setSteps((prevSteps) =>
        prevSteps.map((step, i) =>
          i === index ? { ...step, completed: true } : step
        )
      );
    };

    const checkUser = async () => {
      try {
        // Simulate each step with a timeout
        await new Promise((resolve) => setTimeout(resolve, 1000));
        updateStep(0);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        updateStep(1);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        updateStep(2);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        updateStep(3);
      } catch (error) {
        // Handle error
      }
    };

    checkUser();
  }, []);

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
