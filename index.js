require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react']
});

const currentNodeEnv = process.env.NODE_ENV;

require('dotenv').config({ path: `./environment/.env${currentNodeEnv ? '.' + currentNodeEnv.toLowerCase() : ''}` }); // Ensure dotenv is used

const express = require('express');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy'); // Import the http-proxy module
const apiRouter = require('./src/api'); // Import the API router
const { exec } = require('child_process');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const SplashScreen = require('./src/views/SplashScreen').default; // Ensure correct import

const app = express();
const proxy = httpProxy.createProxyServer({ ws: true }); // Create a proxy server with WebSocket support

app.use(express.static(path.join(__dirname, 'dist'))); // Serve the static files from the dist directory
app.use('/api', apiRouter); // Use the API router for /api routes

app.use((req, res, next) => {
  const username = req.header('X-User');
  const email = req.header('X-Email');

  if (!username || username === 'undefined') {
    return res.status(400).send('Missing X-User header');
  }

  if (!email || email === 'undefined') {
    return res.status(400).send('Missing X-Email header');
  }
  checkCodeServer(username).then();

  const groupId = process.env.GROUP_ID;

  const allowedUsersPath = process.env.ALLOWED_USERS_PATH;

  if (!allowedUsersPath) {
    return res.status(500).send('ALLOWED_USERS environment variable is not set');
  }
  new Promise((resolve, reject) => {
    fs.readFile(allowedUsersPath, 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        throw('Failed to read allowed users file');
      }

      resolve(data.split('\n').map(line => line.trim()).filter(line => line));
    })
  })
  .then((allowedEmails) => {

    if (!allowedEmails || !allowedEmails.includes(email)) {
      return res.status(403).send('Email not allowed');
    }
  })
    
});

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

function checkCodeServer(username) {
  return new Promise((resolve, reject) => {
    const command = `ps -eo user:25,cmd | awk '/--port/ {for (i=2; i<=NF; i++) if ($i ~ /^--port/) print $1, $(i+1)}'`;
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
  const portMappingsPath = path.resolve(__dirname, 'portMappings.json');
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
  const portMappingsPath = path.resolve(__dirname, 'portMappings.json');
  fs.writeFileSync(portMappingsPath, JSON.stringify(mappings, null, 2));
}