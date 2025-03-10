require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react']
});

const currentNodeEnv = process.env.NODE_ENV;

require('dotenv').config({ path: `./environment/.env${currentNodeEnv ? '.' + currentNodeEnv.toLowerCase() : ''}` }); // Ensure dotenv is used

const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const http = require('http'); // Import the http module
const path = require('path');
const httpProxy = require('http-proxy'); // Import the http-proxy module
const net = require('net'); // Import the net module
const SplashScreen = require('./src/views/SplashScreen').default; // Ensure correct import

const app = express();
const portMappingsPath = path.resolve(__dirname, 'portMappings.json');
const proxy = httpProxy.createProxyServer({ ws: true }); // Create a proxy server with WebSocket support

const stepTimeout = process.env.STEP_TIMEOUT || 30000; // Default to 30 seconds

const withTimeout = (promise, timeout) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Step timed out')), timeout))
  ]);
};

app.use((req, res, next) => {
  const username = req.header('X-User');
  const email = req.header('X-Email');

  if (!username || username === 'undefined') {
    return res.status(400).send('Missing X-User header');
  }

  if (!email || email === 'undefined') {
    return res.status(400).send('Missing X-Email header');
  }

  const groupId = process.env.GROUP_ID;

  const allowedUsersPath = process.env.ALLOWED_USERS_PATH;
  if (!allowedUsersPath) {
    return res.status(500).send('ALLOWED_USERS environment variable is not set');
  }

  fs.readFile(allowedUsersPath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to read allowed users file');
    }

    const allowedEmails = data.split('\n').map(line => line.trim()).filter(line => line);
    if (!allowedEmails.includes(email)) {
      return res.status(403).send('Email not allowed');
    }

    const steps = [
      { label: 'Checking user profile...', completed: false },
      { label: 'Creating user profile...', completed: false },
      { label: 'Adding user to group...', completed: false },
      { label: 'Checking existing code-server instance...', completed: false },
      { label: 'Starting codeserver user instance...', completed: false },
    ];

    const updateSplashScreen = (stepIndex) => {
      steps[stepIndex].completed = true;
      if (process.env.NODE_ENV === 'development') {
        console.log(`Step ${stepIndex + 1}: ${steps[stepIndex].label}`);
      }
      const splashScreenHtml = ReactDOMServer.renderToString(React.createElement(SplashScreen, { steps }));
      if (!res.headersSent) {
        res.write(splashScreenHtml);
      }
    };

    res.write('<!DOCTYPE html><html><head><title>Setup in Progress</title></head><body>');
    res.write('<div id="root">');

    withTimeout(checkUser(username, groupId), stepTimeout)
      .then(() => {
        updateSplashScreen(0);
        return withTimeout(createUser(username, groupId), stepTimeout);
      })
      .then(() => {
        updateSplashScreen(1);
        return withTimeout(addUserToGroup(username, groupId), stepTimeout);
      })
      .then(() => {
        updateSplashScreen(2);
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
        res.write('</div></body></html>');
        res.end();
        forwardRequest(req, res, port);
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
});

module.exports = app; // Export the app instance

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server listening on port ${process.env.PORT || 3000}`);
});

app.on('upgrade', (req, socket, head) => {
  const username = req.headers['x-user'];
  const portMapping = getPortMapping(username);
  if (portMapping) {
    proxy.ws(req, socket, head, { target: `http://localhost:${portMapping.port}` });
  } else {
    socket.destroy();
  }
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
  fs.writeFileSync(portMappingsPath, JSON.stringify(mappings, null, 2));
}

function forwardRequest(req, res, port) {
  const options = {
    hostname: process.env.DESTINATION_HOST ?? 'localhost',
    port: port,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxy = http.request(options, (proxyRes) => {
    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
    }
    proxyRes.pipe(res, {
      end: true
    });
  });

  proxy.on('error', (err) => {
    console.error('Error forwarding request:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  req.pipe(proxy, {
    end: true
  });
}