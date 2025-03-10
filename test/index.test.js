const request = require('supertest');
const app = require('../index'); // Import the app instance
const http = require('http');
const fs = require('fs');
const path = require('path');

let server;

beforeAll((done) => {
  server = http.createServer(app);
  server.listen(done);
});

afterAll((done) => {
  server.close(done);
});

jest.mock('fs');

describe('User Handler Tests', () => {
  const allowedUsersPath = path.resolve(__dirname, '../allowed_users.txt');
  const allowedEmails = 'allowed@example.com\nanother@example.com';

  beforeEach(() => {
    process.env.ALLOWED_USERS_PATH = allowedUsersPath;
    fs.readFile.mockImplementation((filePath, encoding, callback) => {
      if (filePath === allowedUsersPath) {
        callback(null, allowedEmails);
      } else {
        callback(new Error('File not found'));
      }
    });
  });

  it('should return 400 if X-User header is missing', (done) => {
    request(server)
      .get('/')
      .set('X-Email', 'allowed@example.com')
      .expect(400)
      .expect('Missing X-User header', done);
  });

  it('should return 400 if X-Email header is missing', (done) => {
    request(server)
      .get('/')
      .set('X-User', 'testuser')
      .expect(400)
      .expect('Missing X-Email header', done);
  });

  it('should return 403 if email is not allowed', (done) => {
    request(server)
      .get('/')
      .set('X-User', 'testuser')
      .set('X-Email', 'notallowed@example.com')
      .expect(403)
      .expect('Email not allowed', done);
  });

  it('should return 500 if there is an internal server error', (done) => {
    fs.readFile.mockImplementationOnce((filePath, encoding, callback) => {
      callback(new Error('Internal server error'));
    });

    request(server)
      .get('/')
      .set('X-User', 'nonexistentuser')
      .set('X-Email', 'allowed@example.com')
      .expect(500)
      .expect('Failed to read allowed users file', done);
  });

  it('should return 200 and forward the request if user exists', (done) => {
    request(server)
      .get('/')
      .set('X-User', 'existinguser')
      .set('X-Email', 'allowed@example.com')
      .expect(200, done);
  });

  it('should create a new user if user does not exist', (done) => {
    request(server)
      .get('/')
      .set('X-User', 'newuser')
      .set('X-Email', 'allowed@example.com')
      .expect(200, done);
  });

  it('should enable and start the service for the user', (done) => {
    request(server)
      .get('/')
      .set('X-User', 'serviceuser')
      .set('X-Email', 'allowed@example.com')
      .expect(200, done);
  });
});
