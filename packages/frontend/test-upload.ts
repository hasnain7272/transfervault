import fs from 'node:fs';
import path from 'node:path';
import * as tus from 'tus-js-client';

async function runTest() {
  console.log('--- STARTING INTEGRATION TEST ---');

  const daemonUrl = 'http://127.0.0.1:3001';

  // 1. Create Transfer
  console.log('1. Creating transfer...');
  const createRes = await fetch(`${daemonUrl}/api/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_in_hours: 24,
      files: [{ filename: 'test.txt', size_bytes: 11 }]
    })
  });
  
  if (!createRes.ok) {
    throw new Error(`Failed to create transfer: ${createRes.status} ${await createRes.text()}`);
  }

  const transfer = await createRes.json();
  console.log('Transfer created:', transfer);

  // 2. Upload file via TUS
  console.log('2. Uploading file via TUS...');
  
  const testFile = Buffer.from('hello world');
  
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(testFile as any, {
      endpoint: `${daemonUrl}/api/tus`,
      retryDelays: [0, 1000, 3000, 5000],
      metadata: {
        filename: 'test.txt',
        filetype: 'text/plain',
        pair_code: transfer.pair_code.replace(/-/g, ''),
        file_id: transfer.upload_urls[0].file_id
      },
      onError: function (error) {
        console.error('TUS Upload failed:', error);
        reject(error);
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        var percentage = (bytesUploaded / bytesTotal * 100).toFixed(2);
        console.log(bytesUploaded, bytesTotal, percentage + '%');
      },
      onSuccess: function () {
        console.log('Upload success: %s', upload.url);
        resolve();
      }
    });

    upload.start();
  });

  // 3. Finalize
  console.log('3. Finalizing transfer...');
  const finalizeRes = await fetch(`${daemonUrl}/api/transfers/${transfer.transfer_id}/finalize`, {
    method: 'POST'
  });

  if (!finalizeRes.ok) {
    throw new Error(`Failed to finalize transfer: ${finalizeRes.status} ${await finalizeRes.text()}`);
  }
  
  console.log('Finalize result:', await finalizeRes.json());
  console.log('--- INTEGRATION TEST SUCCESS ---');
}

runTest().catch(console.error);
