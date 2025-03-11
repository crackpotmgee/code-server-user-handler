const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const path = require('path');
const net = require('net');
const SplashScreen = require('../views/SplashScreen').default;

const router = express.Router();
const stepTimeout = process.env.STEP_TIMEOUT || 30000; // Default to 30 seconds

const withTimeout = (promise, timeout) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Step timed out')), timeout))
  ]);
};

router.post('/setup', (req, res) => {
  const username = req.header('X-User');
  const email = req.header('X-Email');

  if (!username || username === 'undefined') {
    return res.status(400).send('Missing X-User header');
  }

  if (!email || email === 'undefined') {
    return res.status(400).send('Missing X-Email header');
  }

  const groupId = process.env.GROUP_ID;

    const steps = [
      { label: 'Checking user profile...', status: 'pending' },
      { label: 'Creating user profile...', status: 'pending' },
      { label: 'Adding user to group...', status: 'pending' },
      { label: 'Checking existing code-server instance...', status: 'pending' },
      { label: 'Starting codeserver user instance...', status: 'pending' },
    ];

    const updateSplashScreen = (stepIndex, status) => {
      if(stepIndex >= 0){
      steps[stepIndex].status = status;
      if (process.env.NODE_ENV === 'development') {
        console.log(`Step ${stepIndex + 1}: ${steps[stepIndex].label}`);
      }
    }
      const splashScreenHtml = ReactDOMServer.renderToString(React.createElement(SplashScreen, { inputSteps: steps }));
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>User Proxy</title>
            <script src="/static/js/bundle.js" defer></script>
          </head>
          <body>
            <div id="root">${splashScreenHtml}</div>
          </body>
        </html>
      `;
      res.write(html);
    };

    updateSplashScreen(-1, 'completed');

    withTimeout(checkUser(username, groupId).catch((error) => { updateSplashScreen(0,'error'); console.error(error); throw error; }), stepTimeout)
      .then(() => {
        updateSplashScreen(0, 'completed');
        return withTimeout(createUser(username, groupId), stepTimeout);
      })
      .then(() => {
        updateSplashScreen(1, 'completed');
        return withTimeout(addUserToGroup(username, groupId), stepTimeout);
      })
      .then(() => {
        updateSplashScreen(2, 'completed');
        const portMapping = getPortMapping(username);
        if (portMapping) {
          return withTimeout(checkPort(portMapping.port), stepTimeout).then((isRunning) => {
            if (isRunning) {
              updateSplashScreen(3); // Mark the new step as completed
              return portMapping.port;
            } else {
              return withTimeout(startCodeServer(username), stepTimeout);
            }
          });
        } else {
          return withTimeout(startCodeServer(username), stepTimeout);
        }
      })
      .then((port) => {
        updateSplashScreen(4);
        res.end();
      })
      .catch((error) => {
        console.error(error);
        fs.appendFile('error.log', `${new Date().toISOString()} - ${error.message}\n`, (err) => {
          if (err) console.error('Failed to write to log file:', err);
        });

        if (!res.headersSent) {
          if (process.env.NODE_ENV === 'development') {
            res.write(`<p>An error occurred: ${error.message}</p>`);
            res.write(`<pre>${error.stack}</pre>`);
          } else {
            res.write('<p>An error occurred. Please check the logs for more details.</p>');
          }
          res.write('</div></body></html>');
          res.end();
        }
      });
  });

function createUser(username, groupId) {
  return new Promise((resolve, reject) => {
    // if no group id set it will not attempt to add one
    exec(`useradd -m ${ groupId ? '-g' + groupId : ''} ${username}`, (error) => {
      if (error) {
        // its ok if the user already exists
        if(error.message.includes('already exists')) {
          resolve();
          return;
        }
        reject(new Error(`Failed to create user: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

function addUserToGroup(username, groupId) {
  return new Promise((resolve, reject) => {
    if (!groupId) {
      resolve();
      return;
    }
    exec(`usermod -aG ${groupId} ${username}`, (error) => {
      if (error) {
        reject(new Error(`Failed to add user to group: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

function startCodeServer(username) {
  return new Promise((resolve, reject) => {
    const port = getAvailablePort();
    const command = `sudo -u ${username} bash -c "code-server --port ${port} --user-data-dir ~/.code-server --extensions-dir ~/.vscode-extensions --auth none"`;
    exec(command, (error) => {
      if (error) {
        reject(new Error(`Failed to start code-server: ${error.message}`));
      } else {
        updatePortMapping(username, port);
        resolve(port);
      }
    });
  });
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false); // Some other error occurred
      }
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(false); // Port is available
      });
    });
    server.listen(port);
  });
}

function getAvailablePort() {
  const minPort = 8000;
  const maxPort = 9000;
  const usedPorts = getPortMappings().map(mapping => mapping.port);
  for (let port = minPort; port <= maxPort; port++) {
    if (!usedPorts.includes(port)) {
      return port;
    }
  }
  throw new Error('No available ports');
}

function getPortMappings() {
  const portMappingsPath = path.resolve(__dirname, '../../portMappings.json');
  if (!fs.existsSync(portMappingsPath)) {
    return [];
  }
  const data = fs.readFileSync(portMappingsPath, 'utf8');
  return JSON.parse(data);
}

function getPortMapping(username) {
  const mappings = getPortMappings();
  return mappings.find(mapping => mapping.username === username);
}

function updatePortMapping(username, port) {
  const mappings = getPortMappings();
  const existingMapping = mappings.find(mapping => mapping.username === username);
  if (existingMapping) {
    existingMapping.port = port;
  } else {
    mappings.push({ username, port });
  }
  const portMappingsPath = path.resolve(__dirname, '../../portMappings.json');
  fs.writeFileSync(portMappingsPath, JSON.stringify(mappings, null, 2));
}

module.exports = router;
