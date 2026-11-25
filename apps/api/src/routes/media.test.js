import { expect, spyOn, test } from 'bun:test';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mediaRoutes } from './media.js';

function post(path, items, db) {
  const url = new URL(path, 'https://api.example.test');
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return mediaRoutes(db, request, url);
}

test('presign allows a browser to upload its image without a public ACL or empty-body checksum', async () => {
  const originalEnv = {
    S3_BUCKET: process.env.S3_BUCKET,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  };
  Object.assign(process.env, {
    S3_BUCKET: 'test-images',
    AWS_REGION: 'eu-west-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
  });
  try {
    const response = await post('/api/media/presign', [
      { name: 'photo.png', type: 'image/png', size: 68 },
    ]);
    expect(response.status).toBe(200);
    const {
      items: [item],
    } = await response.json();
    const signedUrl = new URL(item.url);
    expect(signedUrl.pathname).toBe(`/${item.key}`);
    expect(signedUrl.searchParams.has('x-amz-acl')).toBe(false);
    expect(signedUrl.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(item.contentType).toBe('image/png');
  } finally {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('finalize returns explicit outcomes for uploaded and missing images', async () => {
  const uploaded = { id: 42, name: 'photo.png' };
  const db = {
    insert: () => ({
      values: () => ({ returning: async () => [uploaded] }),
    }),
  };
  const head = spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
    expect(command).toBeInstanceOf(HeadObjectCommand);
    if (command.input.Key === 'media/jdm/missing.png') throw new Error('Object missing');
    return {};
  });
  try {
    const response = await post(
      '/api/media/finalize',
      [
        { key: 'media/jdm/photo.png', name: 'photo.png' },
        { key: 'media/jdm/missing.png', name: 'missing.png' },
      ],
      db
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: [
        { ok: true, item: uploaded },
        { ok: false, key: 'media/jdm/missing.png', error: 'not uploaded' },
      ],
    });
  } finally {
    head.mockRestore();
  }
});
