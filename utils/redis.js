// utils/redis.js

const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = redis.createClient();

    // Handling Redis client errors
    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, reply) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(reply);
      });
    });
  }

  async set(key, value, durationInSeconds) {
    return new Promise((resolve, reject) => {
      this.client.set(key, value, 'EX', durationInSeconds, (err, reply) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(reply);
      });
    });
  }

  async del(key) {
    return new Promise((resolve, reject) => {
      this.client.del(key, (err, reply) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(reply);
      });
    });
  }
}

// Creating and exporting an instance of RedisClient
const redisClient = new RedisClient();
module.exports = redisClient;
