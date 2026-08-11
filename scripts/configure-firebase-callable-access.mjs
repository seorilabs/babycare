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
const gcloudBinary = process.env.SEORILABS_GCLOUD_BIN || 'gcloud';

function gcloud(arguments_) {
  return execFileSync(gcloudBinary, arguments_, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

const runtimeMember = `serviceAccount:${manifest.runtime.serviceAccountEmail}`;

for (const role of manifest.runtime.projectRoles) {
  if (apply) {
    gcloud([
      'projects',
      'add-iam-policy-binding',
      manifest.projectId,
      `--member=${runtimeMember}`,
      `--role=${role}`,
      '--condition=None',
      '--quiet',
    ]);
  }
}

const runtimeBindings = JSON.parse(
  gcloud([
    'projects',
    'get-iam-policy',
    manifest.projectId,
    '--flatten=bindings[].members',
    `--filter=bindings.members:${runtimeMember}`,
    '--format=json(bindings.role)',
  ]),
);
const runtimeRoles = new Set(
  runtimeBindings.map(binding => binding.bindings?.role).filter(Boolean),
);
for (const role of manifest.runtime.projectRoles) {
  if (!runtimeRoles.has(role)) {
    throw new Error(
      `${manifest.runtime.serviceAccountEmail}: 필수 project role ${role}이 없습니다.`,
    );
  }
}

console.log(
  `${manifest.runtime.serviceAccountEmail}: ${manifest.runtime.projectRoles.join(', ')}`,
);

for (const role of manifest.runtime.selfRoles) {
  if (apply) {
    gcloud([
      'iam',
      'service-accounts',
      'add-iam-policy-binding',
      manifest.runtime.serviceAccountEmail,
      `--member=${runtimeMember}`,
      `--role=${role}`,
      `--project=${manifest.projectId}`,
      '--condition=None',
      '--quiet',
    ]);
  }
}

const selfBindings = JSON.parse(
  gcloud([
    'iam',
    'service-accounts',
    'get-iam-policy',
    manifest.runtime.serviceAccountEmail,
    `--project=${manifest.projectId}`,
    '--flatten=bindings[].members',
    `--filter=bindings.members:${runtimeMember}`,
    '--format=json(bindings.role)',
  ]),
);
const selfRoles = new Set(
  selfBindings.map(binding => binding.bindings?.role).filter(Boolean),
);
for (const role of manifest.runtime.selfRoles) {
  if (!selfRoles.has(role)) {
    throw new Error(
      `${manifest.runtime.serviceAccountEmail}: 필수 self role ${role}이 없습니다.`,
    );
  }
}

console.log(
  `${manifest.runtime.serviceAccountEmail}: self ${manifest.runtime.selfRoles.join(', ')}`,
);

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
      '--format=json(metadata.annotations,spec.template.spec.serviceAccountName,status.latestReadyRevisionName)',
    ]),
  );
  const disabled =
    live.metadata?.annotations?.['run.googleapis.com/invoker-iam-disabled'];

  if (disabled !== 'true') {
    throw new Error(
      `${service.functionName}: Cloud Run Invoker IAM check가 비활성화되지 않았습니다.`,
    );
  }

  const liveServiceAccount = live.spec?.template?.spec?.serviceAccountName;
  if (liveServiceAccount !== manifest.runtime.serviceAccountEmail) {
    throw new Error(
      `${service.functionName}: runtime service account가 ${liveServiceAccount ?? '없음'}입니다.`,
    );
  }

  console.log(
    `${service.functionName}: invoker IAM check disabled (${live.status?.latestReadyRevisionName ?? 'revision unknown'})`,
  );
}
