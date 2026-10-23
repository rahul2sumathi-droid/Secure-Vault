const crypto = require('crypto');
const mongoose = require('mongoose');

// Encrypted blobs only. Filenames in GridFS are random so no document names leak from the storage layer.
let bucket;
const getBucket = () =>
  bucket || (bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'encrypted_files' }));

const putBlob = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(crypto.randomUUID());
    stream.once('error', reject);
    stream.once('finish', () => resolve(stream.id));
    stream.end(buffer);
  });

async function getBlob(id) {
  const chunks = [];
  for await (const chunk of getBucket().openDownloadStream(id)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const deleteBlob = (id) => getBucket().delete(id).catch(() => {});

module.exports = { putBlob, getBlob, deleteBlob };
