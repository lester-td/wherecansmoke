import { rename, unlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const datasets = [
  {
    id: 'd_491641889c8add4c7835721bd72aa84a',
    destination: new URL('../src/data/no-smoking-zones.geojson', import.meta.url),
  },
  {
    id: 'd_3c8343c1efaeb05d4d1dbcdd0f599077',
    destination: new URL('../src/data/nparks-no-smoking.geojson', import.meta.url),
  },
];

const temporaryFiles = [];

try {
  for (const dataset of datasets) {
    const temporary = new URL(`${dataset.destination.pathname}.next`, 'file:');
    temporaryFiles.push(temporary);

    const response = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${dataset.id}/poll-download`);
    if (!response.ok) throw new Error(`Download lookup failed for ${dataset.id}: ${response.status}`);

    const payload = await response.json();
    if (payload.code !== 0 || !payload.data?.url) throw new Error(payload.errorMsg || `No download URL for ${dataset.id}`);

    const fileResponse = await fetch(payload.data.url);
    if (!fileResponse.ok) throw new Error(`GeoJSON download failed for ${dataset.id}: ${fileResponse.status}`);
    await writeFile(temporary, await fileResponse.text());
  }

  const validation = spawnSync(process.execPath, [new URL('./validate-no-smoking-data.mjs', import.meta.url).pathname], {
    env: {
      ...process.env,
      NO_SMOKING_ZONE_FILE: temporaryFiles[0].pathname,
      NPARKS_NO_SMOKING_FILE: temporaryFiles[1].pathname,
    },
    stdio: 'inherit',
  });
  if (validation.status !== 0) throw new Error('Downloaded snapshots failed validation');

  for (let index = 0; index < datasets.length; index += 1) {
    await rename(temporaryFiles[index], datasets[index].destination);
  }
  console.log(`Updated no-smoking snapshots on ${new Date().toISOString()}`);
} catch (error) {
  await Promise.all(temporaryFiles.map((file) => unlink(file).catch(() => {})));
  throw error;
}
