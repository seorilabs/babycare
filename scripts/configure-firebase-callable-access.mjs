import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile(new URL('../firebase/callable-access.json', import.meta.url), 'utf8'),
);
const supportedArguments = new Set(['--apply']);
const unknownArguments = process.argv.slice(2).filter(
  argument => !supportedArguments.has(argument),
);

if (unknownArguments.length > 0) {
  throw new Error(`지원하지 않는 인자: ${unknownArguments.join(', ')}`);
}

const apply = process.argv.includes('--apply');

function gcloud(arguments_) {
  return execFileSync('gcloud', arguments_, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

for (const service of manifest.services) {
  if (service.invokerIamCheck !== 'disabled') {
    throw new Error(
      `${service.functionName}: 지원하지 않는 invokerIamCheck 값 ${service.invokerIamCheck}`,
    );
  }

  if (apply) {
    gcloud([
      'run',
      'services',
      'update',
      service.serviceName,
      '--no-invoker-iam-check',
      `--region=${manifest.region}`,
      `--project=${manifest.projectId}`,
      '--quiet',
    ]);
  }

  const live = JSON.parse(
    gcloud([
      'run',
      'services',
      'describe',
      service.serviceName,
      `--region=${manifest.region}`,
      `--project=${manifest.projectId}`,
      '--format=json(metadata.annotations,status.latestReadyRevisionName)',
    ]),
  );
  const disabled =
    live.metadata?.annotations?.['run.googleapis.com/invoker-iam-disabled'];

  if (disabled !== 'true') {
    throw new Error(
      `${service.functionName}: Cloud Run Invoker IAM check가 비활성화되지 않았습니다.`,
    );
  }

  console.log(
    `${service.functionName}: invoker IAM check disabled (${live.status?.latestReadyRevisionName ?? 'revision unknown'})`,
  );
}
