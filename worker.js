const Queue = require('bull');
const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const thumbnail = require('image-thumbnail');
const dbClient = require('./utils/db');

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const filesCollection = dbClient.db.collection('files');
  const file = await filesCollection.findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

  if (!file) {
    throw new Error('File not found');
  }

  // Generate thumbnails
  const folderPath = path.dirname(file.localPath);
  const baseFilename = path.basename(file.localPath, path.extname(file.localPath));

  const sizes = [500, 250, 100];
  const promises = sizes.map(async (size) => {
    const thumbnailPath = path.join(folderPath, `${baseFilename}_${size}.jpg`);
    const thumbnailBuffer = await thumbnail(file.localPath, { width: size });
    await promisify(fs.writeFile)(thumbnailPath, thumbnailBuffer);
  });

  await Promise.all(promises);
});

module.exports = {
  fileQueue,
};
