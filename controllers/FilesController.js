// controllers/FilesController.js

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');
const { fileQueue } = require('../worker');

class FilesController {
  static async postNew(req, res) {
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing or invalid type' });
    }

    let localPath = '';

    if (type !== 'folder') {
      // Create a local path for storing files
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Generate a unique filename using UUID
      const fileId = new ObjectId();
      const filename = `${fileId.toString()}_${name}`;
      localPath = path.join(folderPath, filename);

      // Decode Base64 data and write to the local file
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(localPath, buffer);

      // Add job to Bull queue for generating thumbnails if type is 'image'
      if (type === 'image') {
        await fileQueue.add({
          userId,
          fileId: fileId.toString(),
        });
      }
    }

    // Save file information to DB
    const filesCollection = dbClient.db.collection('files');
    const newFile = {
      userId: ObjectId(userId),
      name,
      type,
      parentId: parentId ? ObjectId(parentId) : 0,
      isPublic: isPublic || false,
      localPath,
    };
    await filesCollection.insertOne(newFile);

    // Respond with the created file data
    return res.status(201).json({
      _id: newFile._id,
      name: newFile.name,
      type: newFile.type,
      parentId: newFile.parentId,
      isPublic: newFile.isPublic,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page, 10) || 0;
    const filesCollection = dbClient.db.collection('files');

    const query = { userId: ObjectId(userId) };
    if (parentId !== '0') {
      query.parentId = ObjectId(parentId);
    } else {
      query.parentId = 0;
    }

    const files = await filesCollection.aggregate([
      { $match: query },
      { $skip: page * 20 },
      { $limit: 20 },
    ]).toArray();

    return res.status(200).json(files);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: true } },
    );

    const updatedFile = await filesCollection.findOne({ _id: ObjectId(fileId) });
    return res.status(200).json(updatedFile);
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: false } },
    );

    const updatedFile = await filesCollection.findOne({ _id: ObjectId(fileId) });
    return res.status(200).json(updatedFile);
  }

  // eslint-disable-next-line consistent-return
  static async getFile(req, res) {
    const fileId = req.params.id;
    const { size } = req.query;

    // Check if fileId is a valid ObjectId
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: ObjectId(fileId) });

    // Check if file exists
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if the file is public or the user is authenticated and owner
    const token = req.headers['x-token'];
    const userId = token ? await redisClient.get(`auth_${token}`) : null;

    if (!file.isPublic && (!userId || String(file.userId) !== userId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if the file type is not 'file'
    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // Check if the requested size is valid
    const validSizes = ['500', '250', '100'];
    if (size && !validSizes.includes(size)) {
      return res.status(400).json({ error: 'Invalid size' });
    }

    // Determine the path of the file to be served
    let filePath = file.localPath;
    if (size) {
      const folderPath = path.dirname(file.localPath);
      const baseFilename = path.basename(file.localPath, path.extname(file.localPath));
      filePath = path.join(folderPath, `${baseFilename}_${size}.jpg`);
    }

    // Check if the local file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Determine MIME type based on file name
    const mimeType = mime.lookup(file.name);

    // Stream the file content with correct MIME type
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = FilesController;
