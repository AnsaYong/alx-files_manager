const sha1 = require('sha1');
const dbClient = require('../utils/db');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    const usersCollection = await dbClient.client.db.collection('users');
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) return res.status(400).json({ error: 'Already exist' });

    const hasshedPassword = sha1(password);
    const newUser = {
      email,
      password: hasshedPassword,
    };

    const result = await usersCollection.insertOne(newUser);
    const userId = result.insertedId;

    return res.status(201).json({ userId, email });
  }
}

module.exports = UsersController;
