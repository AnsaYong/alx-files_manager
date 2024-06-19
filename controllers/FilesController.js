// controllers/FilesController.js

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');
// const { fileQueue } = require('../worker');

class FilesController {
  static async postUpload(req, res) {
    const {
      name, type, parentId = '0', isPublic = false, data,
    } = req.body;

    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type or invalid type' });
    }
    if ((type === 'file' || type === 'image') && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Validate parentId if present
    if (parentId !== '0') {
      const filesCollection = dbClient.db.collection('files');
      const parentFile = await filesCollection.findOne({ _id: dbClient.ObjectId(parentId) });

      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Prepare file object to save in DB
    const fileObject = {
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    // Handle different types of files
    if (type === 'folder') {
      // Save folder directly in DB
      const filesCollection = dbClient.db.collection('files');
      const result = await filesCollection.insertOne(fileObject);

      const { _id, ...fileWithoutId } = result.ops[0];
      return res.status(201).json({ ...fileWithoutId, id: _id.toString() });
    }
    // For file and image types, save locally and then in DB
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const fileData = Buffer.from(data, 'base64');
    const fileId = uuidv4();
    const filePath = path.join(folderPath, fileId);

    // Save file locally
    fs.writeFileSync(filePath, fileData);

    // Save file in DB
    const filesCollection = dbClient.db.collection('files');
    const result = await filesCollection.insertOne(fileObject);

    const { _id, ...fileWithoutId } = result.ops[0];
    return res.status(201).json({ ...fileWithoutId, id: _id.toString() });
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
