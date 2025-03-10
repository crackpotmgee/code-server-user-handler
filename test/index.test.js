const request = require('supertest');
const express = require('express');
const app = require('../index'); // Adjust the path as necessary

describe('User Handler Tests', () => {
  it('should return 400 if X-User header is missing', (done) => {
    request(app)
      .get('/')
      .expect(400)
      .expect('Missing X-User header', done);
  });

  it('should return 500 if there is an internal server error', (done) => {
    request(app)
      .get('/')
      .set('X-User', 'nonexistentuser')
      .expect(500)
      .expect('Internal server error', done);
  });

  it('should return 200 and forward the request if user exists', (done) => {
    request(app)
      .get('/')
      .set('X-User', 'existinguser')
      .expect(200, done);
  });

  it('should create a new user if user does not exist', (done) => {
    request(app)
      .get('/')
      .set('X-User', 'newuser')
      .expect(200, done);
  });

  it('should enable and start the service for the user', (done) => {
    request(app)
      .get('/')
      .set('X-User', 'serviceuser')
      .expect(200, done);
  });
});
