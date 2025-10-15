const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const sharp = require('sharp');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');
const { Readable } = require('stream');
const { HeadObjectCommand } = require('@aws-sdk/client-s3'); 

const client = new S3Client({
  region: process.env.S3_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  useAccelerateEndpoint: true,
  signatureVersion: 'v4',
  // credentials: {
  //   accessKeyId: process.env.AWS_ACCESS_KEY,
  //   secretAccessKey: process.env.AWS_SECRET_KEY
  // }
  // "endpoint": "http://localhost:8080",
  // computeChecksums: false,
});

const S3_PREFIX = process.env.S3_PREFIX ?? 'media/'; // ← sizda ishlatilgan prefix

function withPrefix(key) {
  // key allaqachon prefix bilan kelsa, takrorlamaymiz
  return key.startsWith(S3_PREFIX) ? key : `${S3_PREFIX}${key}`;
}

function getSignedUploadUrl(path, props = {}) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    ACL: 'public-read',
    Key: withPrefix(path),
    ...props,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 60 });
}

function deleteObject(path) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: path,
  });

  return client.send(command);
}

async function copyObject(sourcePath, destinationPath) {
  const copyCommand = new CopyObjectCommand({
    Bucket: process.env.S3_BUCKET,
    CopySource: `${process.env.S3_BUCKET}/${sourcePath}`,
    Key: destinationPath,
    ACL: 'public-read',
  });

  await client.send(copyCommand);

  // Return the new URL
  return `https://${process.env.S3_BUCKET}.s3-accelerate.amazonaws.com/${destinationPath}`;
}

async function moveObject(sourcePath, destinationPath) {
  // Copy the object to new location
  const newUrl = await copyObject(sourcePath, destinationPath);

  // Delete the original object
  await deleteObject(sourcePath);

  return newUrl;
}

async function resizeAndUploadImage(
  path,
  newPath,
  { dimensions = { width: 400, height: 300 } } = {}
) {
  const getObjectCommand = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: path,
  });
  // Get the object as a stream
  const data = await client.send(getObjectCommand);
  const readStream = data.Body;

  // Resize the image using sharp
  const resizeStream = sharp().resize(dimensions.width, dimensions.height);

  // Transform the sharp stream to a readable stream
  const transformedStream = new Readable();
  transformedStream._read = () => {}; // _read is required but you can noop it
  resizeStream.on('data', chunk => transformedStream.push(chunk));
  resizeStream.on('end', () => transformedStream.push(null));

  // Pipe the S3 stream to the resize stream
  readStream.pipe(resizeStream);

  return await upload(newPath, transformedStream);
}

async function upload(newPath, transformedStream) {
  const params = {
    Bucket: process.env.S3_BUCKET,
    ACL: 'public-read',
    Key: newPath,
    Body: transformedStream,
  };

  const uploader = new Upload({ client, params });
  await uploader.done();

  return `https://${process.env.S3_BUCKET}.s3-${process.env.S3_REGION}.amazonaws.com/${newPath}`;
}

async function headObjectExists(path) {
  try {
    const cmd = new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path });
    await client.send(cmd);
    return true;
  } catch (e) {
    return false; // 404 yoki ruxsat yo'q bo'lsa false
  }
}

module.exports = {
  getSignedUploadUrl,
  deleteObject,
  copyObject,
  moveObject,
  resizeAndUploadImage,
  upload,
  headObjectExists
};
