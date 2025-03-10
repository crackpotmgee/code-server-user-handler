import React from 'react';
import './SplashScreen.css';

const SplashScreen = ({ steps }) => {mpletedSteps = steps.filter(step => step.completed).length;
  const completedSteps = steps.filter(step => step.completed).length;etedSteps / steps.length) * 100;
  const progressPercentage = (completedSteps / steps.length) * 100;

  return (een">
    <div className="splash-screen">
      <h1>Setup in Progress</h1>ogress-bar">
      <div className="progress-bar">assName="progress" style={{ width: `${progressPercentage}%` }}></div>
        <div className="progress" style={{ width: `${progressPercentage}%` }}></div>>
      </div>
      <ul>teps.map((step) => (
        {steps.map((step) => (      <li key={step.label} className={step.completed ? 'completed' : ''}>
          <li key={step.label} className={step.completed ? 'completed' : ''}>          {step.label}
            {step.label}          </li>
          </li>
        ))}      </ul>







export default SplashScreen;};  );    </div>      </ul>    </div>
  );
};

export default SplashScreen;
