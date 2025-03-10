import React, { useState, useEffect } from 'react';

const SplashScreen = () => {
  const [steps, setSteps] = useState([
    { label: 'Checking user profile...', completed: false },
    { label: 'Creating user profile...', completed: false },
    { label: 'Adding user to group...', completed: false },
    { label: 'Starting codeserver user instance...', completed: false },
  ]);

  useEffect(() => {
    const checkUser = async () => {
      try {
        await checkUser('username', 'groupId');
        setSteps((prevSteps) => prevSteps.map((step) => ({ ...step, completed: true })));
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