require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react']
});

require('dotenv').config(); // Ensure dotenv is used

const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const SplashScreen = require('./src/views/SplashScreen.jsx'); // Updated file extension

const app = express();

app.use((req, res, next) => {
  const username = req.header('X-User');

  if (!username) {
    return res.status(400).send('Missing X-User header');
  }

  const steps = [
    { label: 'Checking user profile...', completed: false },
    { label: 'Creating user profile...', completed: false },
    { label: 'Adding user to group...', completed: false },
    { label: 'Starting codeserver user instance...', completed: false },
  ];

  const updateSplashScreen = (stepIndex) => {
    steps[stepIndex].completed = true;
    const splashScreenHtml = ReactDOMServer.renderToString(React.createElement(SplashScreen, { steps }));
    res.write(splashScreenHtml);
  };

  res.write('<!DOCTYPE html><html><head><title>Setup in Progress</title></head><body>');
  res.write('<div id="root">');

  checkUser(username, req.header('GroupId'))
    .then(() => {
      updateSplashScreen(0);
      return createUser(username, req.header('GroupId'));
    })
    .then(() => {
      updateSplashScreen(1);
      return enableService(username);
    })
    .then(() => {
      updateSplashScreen(2);
      return startService(username);
    })
    .then(() => {
      updateSplashScreen(3);
      res.write('</div></body></html>');
      forwardRequest(req, res);
    })
    .catch((error) => {
      console.error(error);
      fs.appendFile('error.log', `${new Date().toISOString()} - ${error.message}\n`, (err) => {
        if (err) console.error('Failed to write to log file:', err);
      });

      if (process.env.NODE_ENV === 'development') {
        res.write(`<p>An error occurred: ${error.message}</p>`);
        res.write(`<pre>${error.stack}</pre>`);
      } else {
        res.write('<p>An error occurred. Please check the logs for more details.</p>');
      }

      res.write('</div></body></html>');
      res.end();
    });
});

module.exports = app; // Export the app instance

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server listening on port ${process.env.PORT || 3000}`);
});

function checkUser(username, groupId) {
  return new Promise((resolve, reject) => {
    exec(`id -u ${username}`, (error, stdout) => {
      if (error) {
        if (error.code === 'ENOENT') {
          createUser(username, groupId)
            .then(() => {
              resolve();
            })
            .catch((error) => {
              reject(new Error(`Failed to create user: ${error.message}`));
            });
        } else {
          reject(new Error(`Failed to check user: ${error.message}`));
        }
      } else {
        resolve();
      }
    });
  });
}

function createUser(username, groupId) {
  return new Promise((resolve, reject) => {
    exec(`useradd -m -g ${groupId} ${username}`, (error) => {
      if (error) {
        reject(new Error(`Failed to create user: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

function enableService(username) {
  return new Promise((resolve, reject) => {
    exec(`sudo systemctl enable code-server@${username}.service`, (error) => {
      if (error) {
        reject(new Error(`Failed to enable service: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

function startService(username) {
  return new Promise((resolve, reject) => {
    exec(`sudo systemctl start code-server@${username}.service`, (error) => {
      if (error) {
        reject(new Error(`Failed to start service: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

function forwardRequest(req, res) {
  const targetPort = process.env.TARGET_PORT || 8443;

  req.pipe(
    request({
      port: targetPort,
      method: req.method,
      headers: req.headers,
    })
  ).pipe(res);
}