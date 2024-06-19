const Queue = require('bull/lib/queue');
const sha1 = require('sha1');
const dbClient = require('../utils/db');

const emailQueue = new Queue('emailQueue');

class UsersController {
  static async postNew(req, res) {
    const userEmail = req.body ? req.body.email : null;
    const userPassword = req.body ? req.body.password : null;

    if (!userEmail) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!userPassword) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }

    const usersCollection = await dbClient.usersCollection();
    const existingUser = await usersCollection.findOne({ email: userEmail });

    if (existingUser) {
      res.status(400).json({ error: 'Already exists' });
      return;
    }

    const hashedPassword = sha1(userPassword);
    const insertionResult = await usersCollection.insertOne(
      { email: userEmail, password: hashedPassword },
    );
    const userId = insertionResult.insertedId.toString();

    emailQueue.add({ userId });
    res.status(201).json({ email: userEmail, id: userId });
  }

  static async getMe(req, res) {
    const { user } = req;

    res.status(200).json({ email: user.email, id: user._id.toString() });
  }
}

module.exports = UsersController;
