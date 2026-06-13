import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import sharp from "sharp";

const client = new S3Client({
  region: process.env.S3_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  useAccelerateEndpoint: true,
  signatureVersion: "v4",
});

const S3_PREFIX = process.env.S3_PREFIX ?? "media/";

function withPrefix(key) {
  return key.startsWith(S3_PREFIX) ? key : `${S3_PREFIX}${key}`;
}

export function getSignedUploadUrl(path, props = {}) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    ACL: "public-read",
    Key: withPrefix(path),
    ...props,
  });
  return getSignedUrl(client, command, { expiresIn: 60 * 60 });
}

export function deleteObject(path) {
  return client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path }));
}

export function deleteObjects(keys) {
  if (!keys?.length) return Promise.resolve();
  return client.send(
    new DeleteObjectsCommand({
      Bucket: process.env.S3_BUCKET,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}

export async function copyObject(sourcePath, destinationPath) {
  await client.send(
    new CopyObjectCommand({
      Bucket: process.env.S3_BUCKET,
      CopySource: `${process.env.S3_BUCKET}/${sourcePath}`,
      Key: destinationPath,
      ACL: "public-read",
    })
  );
  return `https://${process.env.S3_BUCKET}.s3-accelerate.amazonaws.com/${destinationPath}`;
}

export async function moveObject(sourcePath, destinationPath) {
  const newUrl = await copyObject(sourcePath, destinationPath);
  await deleteObject(sourcePath);
  return newUrl;
}

export async function resizeAndUploadImage(path, newPath, { dimensions = { width: 400, height: 300 } } = {}) {
  const data = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path }));
  const readStream = data.Body;
  const resizeStream = sharp().resize(dimensions.width, dimensions.height);
  const transformedStream = new Readable();
  transformedStream._read = () => {};
  resizeStream.on("data", (chunk) => transformedStream.push(chunk));
  resizeStream.on("end", () => transformedStream.push(null));
  readStream.pipe(resizeStream);
  return upload(newPath, transformedStream);
}

export async function upload(newPath, body) {
  const params = { Bucket: process.env.S3_BUCKET, ACL: "public-read", Key: newPath, Body: body };
  const uploader = new Upload({ client, params });
  await uploader.done();
  return `https://${process.env.S3_BUCKET}.s3-${process.env.S3_REGION}.amazonaws.com/${newPath}`;
}

export async function headObjectExists(path) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path }));
    return true;
  } catch {
    return false;
  }
}
